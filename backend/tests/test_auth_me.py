import os
import sys
import asyncio
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from slowapi.errors import RateLimitExceeded

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./test_auth_me.db"
os.environ["JWT_SECRET"] = "x" * 32

from app import db
from app.models import User, Player
from app.routers import auth

app = FastAPI()
app.state.limiter = auth.limiter
app.add_exception_handler(RateLimitExceeded, auth.rate_limit_handler)
app.include_router(auth.router)


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    async def init_models():
        if os.path.exists("./test_auth_me.db"):
            os.remove("./test_auth_me.db")
        db.engine = None
        db.AsyncSessionLocal = None
        engine = db.get_engine()
        async with engine.begin() as conn:
            await conn.run_sync(db.Base.metadata.create_all, tables=[User.__table__, Player.__table__])
    asyncio.run(init_models())
    yield
    if os.path.exists("./test_auth_me.db"):
        os.remove("./test_auth_me.db")


def test_get_and_update_me():
    with TestClient(app) as client:
        resp = client.post("/auth/signup", json={"username": "alice", "password": "Str0ng!Pass"})
        assert resp.status_code == 200
        token = resp.json()["access_token"]

        me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me.status_code == 200
        assert me.json()["username"] == "alice"

        resp = client.put(
            "/auth/me",
            json={"username": "alice2", "password": "N3w!Pass"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        new_token = resp.json()["access_token"]

        bad_login = client.post(
            "/auth/login", json={"username": "alice", "password": "Str0ng!Pass"}
        )
        assert bad_login.status_code == 401

        good_login = client.post(
            "/auth/login", json={"username": "alice2", "password": "N3w!Pass"}
        )
        assert good_login.status_code == 200

        me2 = client.get(
            "/auth/me", headers={"Authorization": f"Bearer {new_token}"}
        )
        assert me2.status_code == 200
        assert me2.json()["username"] == "alice2"
