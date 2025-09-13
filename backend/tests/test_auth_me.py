import os
import sys
import asyncio
import uuid
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from slowapi.errors import RateLimitExceeded
from sqlalchemy import select

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import db
from app.models import Player, RefreshToken, User
from app.routers import auth

app = FastAPI()
app.state.limiter = auth.limiter
app.add_exception_handler(RateLimitExceeded, auth.rate_limit_handler)
app.include_router(auth.router)


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    async def init_models():
        os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./test_auth_me.db"
        if os.path.exists("./test_auth_me.db"):
            os.remove("./test_auth_me.db")
        db.engine = None
        db.AsyncSessionLocal = None
        engine = db.get_engine()
        async with engine.begin() as conn:
            await conn.run_sync(
                db.Base.metadata.create_all,
                tables=[
                    User.__table__,
                    Player.__table__,
                    RefreshToken.__table__,
                ],
            )
    asyncio.run(init_models())
    yield
    if os.path.exists("./test_auth_me.db"):
        os.remove("./test_auth_me.db")


def test_get_and_update_me():
    auth.limiter.reset()
    with TestClient(app) as client:
        resp = client.post("/auth/signup", json={"username": "alice", "password": "Str0ng!Pass!"})
        assert resp.status_code == 200
        token = resp.json()["access_token"]

        me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me.status_code == 200
        assert me.json()["username"] == "alice"

        resp = client.put(
            "/auth/me",
            json={"username": "alice2", "password": "N3w!LongPass"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        new_token = resp.json()["access_token"]

        bad_login = client.post(
            "/auth/login", json={"username": "alice", "password": "Str0ng!Pass!"}
        )
        assert bad_login.status_code == 401

        good_login = client.post(
            "/auth/login", json={"username": "alice2", "password": "N3w!LongPass"}
        )
        assert good_login.status_code == 200

        me2 = client.get(
            "/auth/me", headers={"Authorization": f"Bearer {new_token}"}
        )
        assert me2.status_code == 200
        assert me2.json()["username"] == "alice2"


def test_update_me_conflicting_player_name():
    with TestClient(app) as client:
        resp = client.post(
            "/auth/signup", json={"username": " Bob ", "password": "Str0ng!Pass!"}
        )
        assert resp.status_code == 200
        token = resp.json()["access_token"]

        async def create_player():
            async with db.AsyncSessionLocal() as session:
                session.add(Player(id=uuid.uuid4().hex, name="Taken"))
                await session.commit()

        asyncio.run(create_player())

        resp = client.put(
            "/auth/me",
            json={"username": "taken"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 400
        assert resp.json()["detail"] == "player exists"


def test_me_missing_user():
    auth.limiter.reset()
    with TestClient(app) as client:
        resp = client.post(
            "/auth/signup", json={"username": "ghost", "password": "Str0ng!Pass!"}
        )
        assert resp.status_code == 200
        token = resp.json()["access_token"]

        async def delete_user():
            async with db.AsyncSessionLocal() as session:
                user = (
                    await session.execute(
                        select(User).where(User.username == "ghost")
                    )
                ).scalar_one()
                await session.delete(user)
                await session.commit()

        asyncio.run(delete_user())

        resp = client.get(
            "/auth/me", headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 401
        assert resp.json()["detail"] == "user not found"
