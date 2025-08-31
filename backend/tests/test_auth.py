import os
import sys
import asyncio
import pytest

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./test_auth.db"
os.environ["JWT_SECRET"] = "testsecret"
os.environ["ADMIN_SECRET"] = "admintest"

from fastapi import FastAPI
from fastapi.testclient import TestClient
from app import db
from app.models import User, Player, Club
from app.routers import auth, players

app = FastAPI()
app.include_router(auth.router)
app.include_router(players.router)


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
            "/auth/signup", json={"username": "alice", "password": "pw"}
        )
        assert resp.status_code == 200
        token = resp.json()["access_token"]
        assert token

        resp = client.post(
            "/auth/login", json={"username": "alice", "password": "pw"}
        )
        assert resp.status_code == 200
        user_token = resp.json()["access_token"]

        pid = client.post("/players", json={"name": "Bob"}).json()["id"]
        resp = client.delete(
            f"/players/{pid}", headers={"Authorization": f"Bearer {user_token}"}
        )
        assert resp.status_code == 403

        resp = client.post(
            "/auth/signup",
            json={"username": "admin", "password": "pw", "is_admin": True},
        )
        assert resp.status_code == 403

        admin_token = client.post(
            "/auth/signup",
            json={"username": "admin", "password": "pw", "is_admin": True},
            headers={"X-Admin-Secret": "admintest"},
        ).json()["access_token"]
        resp = client.delete(
            f"/players/{pid}", headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert resp.status_code == 204
