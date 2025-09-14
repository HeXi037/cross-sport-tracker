import os
import sys
import asyncio
import uuid
import secrets
from datetime import datetime, timedelta
import jwt
import pytest
from sqlalchemy import select

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Use a sufficiently long JWT secret for tests
os.environ["JWT_SECRET"] = "x" * 32
os.environ["ADMIN_SECRET"] = "admintest"

from fastapi import FastAPI
from slowapi.errors import RateLimitExceeded
from fastapi.testclient import TestClient
from app import db
from app.models import User, Player, Club, RefreshToken
from app.routers import auth, players
from app.routers.auth import pwd_context

app = FastAPI()
app.state.limiter = auth.limiter
app.add_exception_handler(RateLimitExceeded, auth.rate_limit_handler)
app.include_router(auth.router)
app.include_router(players.router)

async def create_player(name: str, user_id: str | None = None) -> str:
    async with db.AsyncSessionLocal() as session:
        pid = uuid.uuid4().hex
        player = Player(id=pid, name=name, user_id=user_id)
        session.add(player)
        await session.commit()
        return pid

@pytest.fixture(scope="module", autouse=True)
def setup_db():
    async def init_models():
        if os.path.exists("./test_auth.db"):
            os.remove("./test_auth.db")
        db.engine = None
        db.AsyncSessionLocal = None
        engine = db.get_engine()
        async with engine.begin() as conn:
            await conn.run_sync(
                db.Base.metadata.create_all,
                tables=[
                    User.__table__,
                    Player.__table__,
                    Club.__table__,
                    RefreshToken.__table__,
                ],
            )
    asyncio.run(init_models())
    yield
    if os.path.exists("./test_auth.db"):
        os.remove("./test_auth.db")

def test_signup_login_and_protected_access():
    with TestClient(app) as client:
        resp = client.post(
            "/auth/signup", json={"username": "Alice", "password": "Str0ng!Pass!"}
        )
        assert resp.status_code == 200
        token = resp.json()["access_token"]
        assert token

        async def fetch_user():
            async with db.AsyncSessionLocal() as session:
                return (
                    await session.execute(
                        select(User).where(User.username == "alice")
                    )
                ).scalar_one()

        user = asyncio.run(fetch_user())
        assert user.password_hash != "pw"
        assert pwd_context.verify("Str0ng!Pass!", user.password_hash)

        resp = client.post(
            "/auth/login", json={"username": "Alice", "password": "Str0ng!Pass!"}
        )
        assert resp.status_code == 200
        user_token = resp.json()["access_token"]

        resp = client.post(
            "/auth/signup",
            json={"username": "admin", "password": "Str0ng!Pass!", "is_admin": True},
        )
        assert resp.status_code == 403

        admin_token = client.post(
            "/auth/signup",
            json={"username": "admin", "password": "Str0ng!Pass!", "is_admin": True},
            headers={"X-Admin-Secret": "admintest"},
        ).json()["access_token"]

        pid = client.post(
            "/players",
            json={"name": "Bob"},
            headers={"Authorization": f"Bearer {admin_token}"},
        ).json()["id"]
        resp = client.delete(
            f"/players/{pid}", headers={"Authorization": f"Bearer {user_token}"}
        )
        assert resp.status_code == 403

        resp = client.delete(
            f"/players/{pid}", headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert resp.status_code == 204

@pytest.mark.parametrize(
    "username,password",
    [
        ("weak1", "short"),
        ("weak2", "allletters"),
        ("weak3", "NoSymbol1"),
        ("weak4", "NoNumber!"),
    ],
)
def test_signup_rejects_invalid_password(username, password):
    auth.limiter.reset()
    with TestClient(app) as client:
        resp = client.post(
            "/auth/signup", json={"username": username, "password": password}
        )
        assert resp.status_code == 422

def test_signup_links_orphan_player():
    auth.limiter.reset()
    pid = asyncio.run(create_player("charlie"))
    with TestClient(app) as client:
        resp = client.post(
            "/auth/signup", json={"username": "charlie", "password": "Str0ng!Pass!"}
        )
        assert resp.status_code == 200

    async def fetch():
        async with db.AsyncSessionLocal() as session:
            player = await session.get(Player, pid)
            user = (
                await session.execute(select(User).where(User.username == "charlie"))
            ).scalar_one()
            same_name_players = (
                await session.execute(select(Player).where(Player.name == "charlie"))
            ).scalars().all()
            return player, user, same_name_players

    player, user, same_name_players = asyncio.run(fetch())
    assert player.user_id == user.id
    assert len(same_name_players) == 1

def test_signup_rejects_attached_player():
    auth.limiter.reset()
    asyncio.run(create_player("dave", user_id="attached"))
    with TestClient(app) as client:
        resp = client.post(
            "/auth/signup", json={"username": "dave", "password": "Str0ng!Pass!"}
        )
        assert resp.status_code == 400
        assert resp.json()["detail"] == "player exists"

    async def fetch_user():
        async with db.AsyncSessionLocal() as session:
            user = (
                await session.execute(select(User).where(User.username == "dave"))
            ).scalar_one_or_none()
            return user

    user = asyncio.run(fetch_user())
    assert user is None

def test_login_rate_limited():
    auth.limiter.reset()
    with TestClient(app) as client:
        resp = client.post(
            "/auth/signup", json={"username": "rate", "password": "Str0ng!Pass!"}
        )
        assert resp.status_code == 200
        for _ in range(5):
            ok = client.post(
                "/auth/login", json={"username": "rate", "password": "Str0ng!Pass!"}
            )
            assert ok.status_code == 200
        resp = client.post(
            "/auth/login", json={"username": "rate", "password": "Str0ng!Pass!"}
        )
        assert resp.status_code == 429

def test_login_rate_limited_per_ip():
    auth.limiter.reset()
    with TestClient(app) as client:
        resp = client.post(
            "/auth/signup",
            json={"username": "iprate", "password": "Str0ng!Pass!"},
        )
        assert resp.status_code == 200
        h1 = {"X-Forwarded-For": "1.1.1.1"}
        h2 = {"X-Forwarded-For": "2.2.2.2"}
        for _ in range(5):
            ok = client.post(
                "/auth/login",
                json={"username": "iprate", "password": "Str0ng!Pass!"},
                headers=h1,
            )
            assert ok.status_code == 200
        resp = client.post(
            "/auth/login",
            json={"username": "iprate", "password": "Str0ng!Pass!"},
            headers=h1,
        )
        assert resp.status_code == 429
        ok2 = client.post(
            "/auth/login",
            json={"username": "iprate", "password": "Str0ng!Pass!"},
            headers=h2,
        )
        assert ok2.status_code == 200

def test_login_rate_limit_not_bypassed_by_spoofed_x_forwarded_for():
    auth.limiter.reset()
    with TestClient(app) as client:
        resp = client.post(
            "/auth/signup", json={"username": "spoof", "password": "Str0ng!Pass!"}
        )
        assert resp.status_code == 200
        real_ip = "9.9.9.9"
        for i in range(5):
            headers = {"X-Forwarded-For": f"{i}.0.0.1, {real_ip}"}
            ok = client.post(
                "/auth/login",
                json={"username": "spoof", "password": "Str0ng!Pass!"},
                headers=headers,
            )
            assert ok.status_code == 200
        headers = {"X-Forwarded-For": f"random, {real_ip}"}
        resp = client.post(
            "/auth/login",
            json={"username": "spoof", "password": "Str0ng!Pass!"},
            headers=headers,
        )
        assert resp.status_code == 429

def test_jwt_secret_rejects_short(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "short")
    with pytest.raises(RuntimeError):
        auth.get_jwt_secret()

def test_jwt_secret_unset(monkeypatch):
    monkeypatch.delenv("JWT_SECRET", raising=False)
    with pytest.raises(RuntimeError):
        auth.get_jwt_secret()

@pytest.mark.parametrize("secret", ["secret", "changeme"])
def test_jwt_secret_rejects_common_defaults(monkeypatch, secret):
    monkeypatch.setenv("JWT_SECRET", secret)
    with pytest.raises(RuntimeError):
        auth.get_jwt_secret()

def test_jwt_secret_accepts_strong_value(monkeypatch):
    strong = secrets.token_hex(16)
    monkeypatch.setenv("JWT_SECRET", strong)
    assert auth.get_jwt_secret() == strong

def test_me_endpoints():
    auth.limiter.reset()
    with TestClient(app) as client:
        resp = client.post(
            "/auth/signup", json={"username": "meuser", "password": "Str0ng!Pass!"}
        )
        assert resp.status_code == 200
        token = resp.json()["access_token"]

        headers = {"Authorization": f"Bearer {token}"}
        resp = client.get("/auth/me", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["username"] == "meuser"

        resp = client.put(
            "/auth/me",
            json={"username": "meuser2", "password": "NewStr0ng!Pass!"},
            headers=headers,
        )
        assert resp.status_code == 200
        new_token = resp.json()["access_token"]

        resp = client.get("/auth/me", headers={"Authorization": f"Bearer {new_token}"})
        assert resp.status_code == 200
        assert resp.json()["username"] == "meuser2"

        bad_login = client.post(
            "/auth/login", json={"username": "meuser", "password": "Str0ng!Pass!"}
        )
        assert bad_login.status_code == 401

        good_login = client.post(
            "/auth/login", json={"username": "meuser2", "password": "NewStr0ng!Pass!"}
        )
        assert good_login.status_code == 200


def test_expired_token():
    auth.limiter.reset()
    with TestClient(app) as client:
        resp = client.post(
            "/auth/signup", json={"username": "expired", "password": "Str0ng!Pass!"}
        )
        assert resp.status_code == 200
        token = resp.json()["access_token"]
        payload = jwt.decode(
            token, auth.get_jwt_secret(), algorithms=[auth.JWT_ALG]
        )
        expired_token = jwt.encode(
            {
                "sub": payload["sub"],
                "username": payload.get("username"),
                "is_admin": payload.get("is_admin"),
                "exp": datetime.utcnow() - timedelta(seconds=1),
            },
            auth.get_jwt_secret(),
            algorithm=auth.JWT_ALG,
        )
        res = client.get(
            "/auth/me", headers={"Authorization": f"Bearer {expired_token}"}
        )
        assert res.status_code == 401
        assert res.json()["detail"] == "token expired"


def test_refresh_and_revoke():
    auth.limiter.reset()
    with TestClient(app) as client:
        resp = client.post(
            "/auth/signup", json={"username": "refresh", "password": "Str0ng!Pass!"}
        )
        assert resp.status_code == 200
        tokens = resp.json()
        refresh = tokens["refresh_token"]

        resp = client.post("/auth/refresh", json={"refresh_token": refresh})
        assert resp.status_code == 200
        new_tokens = resp.json()
        new_access = new_tokens["access_token"]
        new_refresh = new_tokens["refresh_token"]

        # old refresh token should no longer work
        resp = client.post("/auth/refresh", json={"refresh_token": refresh})
        assert resp.status_code == 401

        # new access token allows access to protected endpoint
        headers = {"Authorization": f"Bearer {new_access}"}
        resp = client.get("/auth/me", headers=headers)
        assert resp.status_code == 200

        # revoke refresh token and ensure it cannot be used
        resp = client.post("/auth/revoke", json={"refresh_token": new_refresh})
        assert resp.status_code == 200
        resp = client.post("/auth/refresh", json={"refresh_token": new_refresh})
        assert resp.status_code == 401
