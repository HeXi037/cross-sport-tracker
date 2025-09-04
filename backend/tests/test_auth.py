import os
import sys
import asyncio
import uuid
import pytest
from sqlalchemy import select

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./test_auth.db"
os.environ["JWT_SECRET"] = "testsecret"
os.environ["ADMIN_SECRET"] = "admintest"

from fastapi import FastAPI
from slowapi.errors import RateLimitExceeded
from fastapi.testclient import TestClient
from app import db
from app.models import User, Player, Club
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
                tables=[User.__table__, Player.__table__, Club.__table__],
            )
    asyncio.run(init_models())
    yield
    if os.path.exists("./test_auth.db"):
        os.remove("./test_auth.db")


def test_signup_login_and_protected_access():
    with TestClient(app) as client:
        resp = client.post(
            "/auth/signup", json={"username": "alice", "password": "Str0ng!Pass"}
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
        assert pwd_context.verify("pw", user.password_hash)

        resp = client.post(
            "/auth/login", json={"username": "alice", "password": "Str0ng!Pass"}
        )
        assert resp.status_code == 200
        user_token = resp.json()["access_token"]

        resp = client.post(
            "/auth/signup",
            json={"username": "admin", "password": "Str0ng!Pass", "is_admin": True},
        )
        assert resp.status_code == 403

        admin_token = client.post(
            "/auth/signup",
            json={"username": "admin", "password": "Str0ng!Pass", "is_admin": True},
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
    with TestClient(app) as client:
        resp = client.post(
            "/auth/signup", json={"username": username, "password": password}
        )
        assert resp.status_code == 422


def test_signup_links_orphan_player():
    pid = asyncio.run(create_player("charlie"))
    with TestClient(app) as client:
        resp = client.post(
            "/auth/signup", json={"username": "charlie", "password": "Str0ng!Pass"}
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
    asyncio.run(create_player("dave", user_id="attached"))
    with TestClient(app) as client:
        resp = client.post(
            "/auth/signup", json={"username": "dave", "password": "Str0ng!Pass"}
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
        client.post("/auth/signup", json={"username": "rate", "password": "pw"})
        for _ in range(5):
            ok = client.post(
                "/auth/login", json={"username": "rate", "password": "pw"}
            )
            assert ok.status_code == 200
        resp = client.post(
            "/auth/login", json={"username": "rate", "password": "pw"}
        )
        assert resp.status_code == 429
