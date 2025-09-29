import os
import sys
import asyncio
import base64
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

VALID_PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC"
)


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    async def init_models():
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
        resp = client.post("/auth/signup", json={"username": "Alice", "password": "Str0ng!Pass!"})
        assert resp.status_code == 200
        token = resp.json()["access_token"]

        me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me.status_code == 200
        assert me.json()["username"] == "alice"
        assert me.json()["photo_url"] is None

        resp = client.put(
            "/auth/me",
            json={"username": "Alice2", "password": "N3w!LongPass"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        new_token = resp.json()["access_token"]

        bad_login = client.post(
            "/auth/login", json={"username": "Alice", "password": "Str0ng!Pass!"}
        )
        assert bad_login.status_code == 401

        good_login = client.post(
            "/auth/login", json={"username": "Alice2", "password": "N3w!LongPass"}
        )
        assert good_login.status_code == 200

        me2 = client.get(
            "/auth/me", headers={"Authorization": f"Bearer {new_token}"}
        )
        assert me2.status_code == 200
        assert me2.json()["username"] == "alice2"
        assert me2.json()["photo_url"] is None


def test_update_me_conflicting_player_name():
    auth.limiter.reset()
    with TestClient(app) as client:
        resp = client.post(
            "/auth/signup", json={"username": "bob", "password": "Str0ng!Pass!"}
        )
        assert resp.status_code == 200
        token = resp.json()["access_token"]

        async def create_player():
            async with db.AsyncSessionLocal() as session:
                session.add(Player(id=uuid.uuid4().hex, name="taken"))
                await session.commit()

        asyncio.run(create_player())

        resp = client.put(
            "/auth/me",
            json={"username": "taken"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 400
        assert resp.json()["detail"] == "player exists"


def test_update_me_allows_claiming_current_player_name():
    auth.limiter.reset()
    with TestClient(app) as client:
        resp = client.post(
            "/auth/signup", json={"username": "claimee", "password": "Str0ng!Pass!"}
        )
        assert resp.status_code == 200
        token = resp.json()["access_token"]

        async def rename_player():
            async with db.AsyncSessionLocal() as session:
                user = (
                    await session.execute(
                        select(User).where(User.username == "claimee")
                    )
                ).scalar_one()
                player = (
                    await session.execute(
                        select(Player).where(Player.user_id == user.id)
                    )
                ).scalar_one()
                player.name = "claimed"
                await session.commit()

        asyncio.run(rename_player())

        resp = client.put(
            "/auth/me",
            json={"username": "claimed"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["access_token"]

        me = client.get(
            "/auth/me", headers={"Authorization": f"Bearer {data['access_token']}"}
        )
        assert me.status_code == 200
        assert me.json()["username"] == "claimed"

        async def fetch_player_name():
            async with db.AsyncSessionLocal() as session:
                user = (
                    await session.execute(
                        select(User).where(User.username == "claimed")
                    )
                ).scalar_one()
                player = (
                    await session.execute(
                        select(Player).where(Player.user_id == user.id)
                    )
                ).scalar_one()
                return player.name

        player_name = asyncio.run(fetch_player_name())
        assert player_name == "claimed"

def test_upload_my_photo():
    auth.limiter.reset()
    with TestClient(app) as client:
        resp = client.post(
            "/auth/signup", json={"username": "picuser", "password": "Str0ng!Pass!"}
        )
        assert resp.status_code == 200
        token = resp.json()["access_token"]

        files = {"file": ("avatar.png", VALID_PNG_BYTES, "image/png")}
        resp = client.post(
            "/auth/me/photo",
            files=files,
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["photo_url"].startswith("/api/static/users/")
        filename = data["photo_url"].split("/")[-1]
        filepath = auth.USER_UPLOAD_DIR / filename
        try:
            assert filepath.exists()
            assert filepath.read_bytes() == VALID_PNG_BYTES
        finally:
            if filepath.exists():
                filepath.unlink()

        async def fetch_user_and_player_photo():
            async with db.AsyncSessionLocal() as session:
                user = (
                    await session.execute(
                        select(User).where(User.username == "picuser")
                    )
                ).scalar_one()
                player = (
                    await session.execute(
                        select(Player).where(Player.user_id == user.id)
                    )
                ).scalar_one()
                return user.photo_url, player.photo_url

        user_photo, player_photo = asyncio.run(fetch_user_and_player_photo())
        assert user_photo == data["photo_url"]
        assert player_photo == data["photo_url"]


def test_delete_my_photo():
    auth.limiter.reset()
    with TestClient(app) as client:
        resp = client.post(
            "/auth/signup", json={"username": "erasepic", "password": "Str0ng!Pass!"}
        )
        assert resp.status_code == 200
        token = resp.json()["access_token"]

        files = {"file": ("avatar.png", VALID_PNG_BYTES, "image/png")}
        upload_resp = client.post(
            "/auth/me/photo",
            files=files,
            headers={"Authorization": f"Bearer {token}"},
        )
        assert upload_resp.status_code == 200
        photo_url = upload_resp.json()["photo_url"]
        filename = photo_url.split("/")[-1]
        filepath = auth.USER_UPLOAD_DIR / filename
        assert filepath.exists()

        delete_resp = client.delete(
            "/auth/me/photo", headers={"Authorization": f"Bearer {token}"}
        )
        assert delete_resp.status_code == 200
        payload = delete_resp.json()
        assert payload["photo_url"] is None
        assert not filepath.exists()

        async def fetch_user_and_player_photo():
            async with db.AsyncSessionLocal() as session:
                user = (
                    await session.execute(
                        select(User).where(User.username == "erasepic")
                    )
                ).scalar_one()
                player = (
                    await session.execute(
                        select(Player).where(Player.user_id == user.id)
                    )
                ).scalar_one()
                return user.photo_url, player.photo_url

        user_photo, player_photo = asyncio.run(fetch_user_and_player_photo())
        assert user_photo is None
        assert player_photo is None


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
