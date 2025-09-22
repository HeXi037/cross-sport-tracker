import asyncio
import os
import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select

from backend.app import db
from backend.app.models import Badge, Player, PlayerBadge, RefreshToken, User
from backend.app.routers import auth, badges

ADMIN_SECRET = "admintest"
os.environ["ADMIN_SECRET"] = ADMIN_SECRET

app = FastAPI()
app.include_router(auth.router)
app.include_router(badges.router)


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    db_path = "./test_badges.db"
    previous_url = os.environ.get("DATABASE_URL")

    async def init_models() -> None:
        if os.path.exists(db_path):
            os.remove(db_path)
        db.engine = None
        db.AsyncSessionLocal = None
        os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{db_path}"
        engine = db.get_engine()
        async with engine.begin() as conn:
            await conn.run_sync(
                db.Base.metadata.create_all,
                tables=[
                    User.__table__,
                    Player.__table__,
                    Badge.__table__,
                    PlayerBadge.__table__,
                    RefreshToken.__table__,
                ],
            )

    asyncio.run(init_models())
    yield
    db.engine = None
    db.AsyncSessionLocal = None
    if os.path.exists(db_path):
        os.remove(db_path)
    if previous_url is not None:
        os.environ["DATABASE_URL"] = previous_url
    else:
        os.environ.pop("DATABASE_URL", None)


@pytest.fixture
def client():
    with TestClient(app) as client:
        yield client


def create_token(client: TestClient, *, is_admin: bool) -> str:
    auth.limiter.reset()
    username = f"{'admin' if is_admin else 'user'}-{uuid.uuid4().hex}"
    payload = {"username": username, "password": "Str0ng!Pass!"}
    if is_admin:
        payload["is_admin"] = True
    headers = {"X-Admin-Secret": ADMIN_SECRET} if is_admin else {}
    response = client.post("/auth/signup", json=payload, headers=headers)
    assert response.status_code == 200
    return response.json()["access_token"]


def attach_badge_to_player(badge_id: str) -> None:
    async def _attach() -> None:
        async with db.AsyncSessionLocal() as session:
            player_id = uuid.uuid4().hex
            player = Player(id=player_id, name=f"player-{uuid.uuid4().hex}")
            session.add(player)
            session.add(
                PlayerBadge(
                    id=uuid.uuid4().hex,
                    player_id=player_id,
                    badge_id=badge_id,
                )
            )
            await session.commit()

    asyncio.run(_attach())


def fetch_badge(badge_id: str) -> Badge | None:
    async def _fetch() -> Badge | None:
        async with db.AsyncSessionLocal() as session:
            return await session.get(Badge, badge_id)

    return asyncio.run(_fetch())


def fetch_player_badge_ids(badge_id: str) -> list[str]:
    async def _fetch() -> list[str]:
        async with db.AsyncSessionLocal() as session:
            rows = (
                await session.execute(
                    select(PlayerBadge.id).where(PlayerBadge.badge_id == badge_id)
                )
            ).scalars().all()
            return list(rows)

    return asyncio.run(_fetch())


def test_badge_crud_flow(client: TestClient) -> None:
    admin_token = create_token(client, is_admin=True)

    create_resp = client.post(
        "/badges",
        json={"name": "AllStar", "icon": "star.png"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert create_resp.status_code == 200
    badge_data = create_resp.json()
    badge_id = badge_data["id"]
    assert badge_data["name"] == "AllStar"
    assert badge_data["icon"] == "star.png"

    update_resp = client.patch(
        f"/badges/{badge_id}",
        json={"name": "HallOfFame", "icon": "gold.png"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert update_resp.status_code == 200
    updated = update_resp.json()
    assert updated == {"id": badge_id, "name": "HallOfFame", "icon": "gold.png"}

    attach_badge_to_player(badge_id)

    delete_resp = client.delete(
        f"/badges/{badge_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert delete_resp.status_code == 204

    assert fetch_badge(badge_id) is None
    assert fetch_player_badge_ids(badge_id) == []

    missing_patch = client.patch(
        f"/badges/{badge_id}",
        json={"name": "NoBadge"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert missing_patch.status_code == 404

    missing_delete = client.delete(
        f"/badges/{badge_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert missing_delete.status_code == 404


def test_badge_name_uniqueness_conflict(client: TestClient) -> None:
    admin_token = create_token(client, is_admin=True)
    base_name = f"Unique-{uuid.uuid4().hex}"

    first_resp = client.post(
        "/badges",
        json={"name": base_name},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert first_resp.status_code == 200

    duplicate_resp = client.post(
        "/badges",
        json={"name": base_name},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert duplicate_resp.status_code == 409
    assert duplicate_resp.json() == {"detail": "badge name exists"}

    other_resp = client.post(
        "/badges",
        json={"name": f"{base_name}-other"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert other_resp.status_code == 200
    other_id = other_resp.json()["id"]

    conflict_patch = client.patch(
        f"/badges/{other_id}",
        json={"name": base_name},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert conflict_patch.status_code == 409
    assert conflict_patch.json() == {"detail": "badge name exists"}


def test_badge_admin_authentication_required(client: TestClient) -> None:
    admin_token = create_token(client, is_admin=True)

    unauthorized_resp = client.post("/badges", json={"name": "NeedsAuth"})
    assert unauthorized_resp.status_code == 401

    protected_resp = client.post(
        "/badges",
        json={"name": f"Secure-{uuid.uuid4().hex}"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert protected_resp.status_code == 200
    badge_id = protected_resp.json()["id"]

    user_token = create_token(client, is_admin=False)

    forbidden_patch = client.patch(
        f"/badges/{badge_id}",
        json={"name": f"Rename-{uuid.uuid4().hex}"},
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert forbidden_patch.status_code == 403
    assert forbidden_patch.json() == {"detail": "forbidden"}

    forbidden_delete = client.delete(
        f"/badges/{badge_id}",
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert forbidden_delete.status_code == 403
    assert forbidden_delete.json() == {"detail": "forbidden"}

    cleanup_resp = client.delete(
        f"/badges/{badge_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert cleanup_resp.status_code == 204
