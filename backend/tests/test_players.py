import os, sys, asyncio, pytest

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

os.environ["ADMIN_SECRET"] = "admintest"

from fastapi import FastAPI
from fastapi.testclient import TestClient
from fastapi.responses import JSONResponse
from app import db
from app.routers import players, auth, badges
from app.models import (
    Player,
    Club,
    User,
    Badge,
    PlayerBadge,
    PlayerMetric,
    RefreshToken,
)
from app.exceptions import DomainException, ProblemDetail

PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc`\x00\x00"
    b"\x00\x02\x00\x01\xe2!\xbc3\x00\x00\x00\x00IEND\xaeB`\x82"
)

app = FastAPI()

@app.exception_handler(DomainException)
async def domain_exception_handler(request, exc):
    problem = ProblemDetail(
        type=exc.type,
        title=exc.title,
        detail=exc.detail,
        status=exc.status_code,
    )
    return JSONResponse(
        status_code=exc.status_code,
        content=problem.model_dump(),
        media_type="application/problem+json",
    )

app.include_router(auth.router)
app.include_router(players.router)
app.include_router(badges.router)

@pytest.fixture(scope="module", autouse=True)
def setup_db():
    async def init_models():
        os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./test_players.db"
        if os.path.exists("./test_players.db"):
            os.remove("./test_players.db")
        db.engine = None
        db.AsyncSessionLocal = None
        engine = db.get_engine()
        async with engine.begin() as conn:
            await conn.run_sync(
                db.Base.metadata.create_all,
                tables=[
                    Club.__table__,
                    Player.__table__,
                    User.__table__,
                    Badge.__table__,
                    PlayerBadge.__table__,
                    PlayerMetric.__table__,
                    RefreshToken.__table__,
                ],
            )
    asyncio.run(init_models())
    yield
    if os.path.exists("./test_players.db"):
        os.remove("./test_players.db")


def admin_token(client: TestClient) -> str:
    auth.limiter.reset()
    resp = client.post(
        "/auth/signup",
        json={"username": "admin", "password": "Str0ng!Pass!", "is_admin": True},
        headers={"X-Admin-Secret": "admintest"},
    )
    if resp.status_code != 200:
        resp = client.post(
            "/auth/login", json={"username": "admin", "password": "Str0ng!Pass!"}
        )
    return resp.json()["access_token"]

def test_list_players_pagination() -> None:
    with TestClient(app) as client:
        token = admin_token(client)
        default_resp = client.get("/players")
        assert default_resp.status_code == 200
        default_data = default_resp.json()
        base_total = default_data.get("total", 0)
        assert default_data["limit"] == 50
        assert default_data["offset"] == 0
        for i in range(5):
            resp = client.post(
                "/players",
                json={"name": f"P{i}"},
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp.status_code == 200
        resp = client.get("/players", params={"limit": 2, "offset": 1})
        assert resp.status_code == 200
        data = resp.json()
        assert data["limit"] == 2
        assert data["offset"] == 1
        assert data["total"] == base_total + 5
        assert len(data["players"]) == 2

def test_delete_player_requires_token() -> None:
    with TestClient(app) as client:
        token = admin_token(client)
        pid = client.post(
            "/players", json={"name": "Alice"}, headers={"Authorization": f"Bearer {token}"}
        ).json()["id"]
        resp = client.delete(f"/players/{pid}")
        assert resp.status_code == 401

def test_delete_player_soft_delete() -> None:
    with TestClient(app, raise_server_exceptions=False) as client:
        token = admin_token(client)
        pid = client.post(
            "/players", json={"name": "Bob"}, headers={"Authorization": f"Bearer {token}"}
        ).json()["id"]
        resp = client.delete(
            f"/players/{pid}", headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 204
        assert client.get(f"/players/{pid}").status_code == 404

    async def check_deleted():
        async with db.AsyncSessionLocal() as session:
            p = await session.get(Player, pid)
            assert p is not None and p.deleted_at is not None

    asyncio.run(check_deleted())


def test_hard_delete_player_allows_username_reuse() -> None:
    with TestClient(app) as client:
        token = admin_token(client)

        # initial signup creates both user and player
        resp = client.post(
            "/auth/signup", json={"username": "Eve", "password": "Str0ng!Pass!"}
        )
        assert resp.status_code == 200

        # lookup player id for Eve
        pid = client.get("/players", params={"q": "Eve"}).json()["players"][0]["id"]

        # hard delete the player (and associated user)
        resp = client.delete(
            f"/players/{pid}",
            params={"hard": "true"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 204

        # signup again with the same username should now succeed
        resp = client.post(
            "/auth/signup", json={"username": "Eve", "password": "Str0ng!Pass!"}
        )
        assert resp.status_code == 200

def test_create_player_invalid_name() -> None:
    with TestClient(app) as client:
        token = admin_token(client)
        resp = client.post(
            "/players",
            json={"name": "Bad!"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 422

def test_player_badges() -> None:
    with TestClient(app) as client:
        token = admin_token(client)
        pid = client.post(
            "/players", json={"name": "Dana"}, headers={"Authorization": f"Bearer {token}"}
        ).json()["id"]
        bid = client.post("/badges", json={"name": "MVP"}).json()["id"]
        resp = client.post(f"/players/{pid}/badges/{bid}")
        assert resp.status_code == 204
        data = client.get(f"/players/{pid}").json()
        assert data["badges"] == [{"id": bid, "name": "MVP", "icon": None}]


def test_players_by_ids_omits_deleted() -> None:
    with TestClient(app) as client:
        token = admin_token(client)
        active_id = client.post(
            "/players", json={"name": "Active"}, headers={"Authorization": f"Bearer {token}"}
        ).json()["id"]
        deleted_id = client.post(
            "/players", json={"name": "Gone"}, headers={"Authorization": f"Bearer {token}"}
        ).json()["id"]
        client.delete(
            f"/players/{deleted_id}", headers={"Authorization": f"Bearer {token}"}
        )
        resp = client.get(
            "/players/by-ids", params={"ids": f"{active_id},{deleted_id}"}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data == [{"id": active_id, "name": "Active", "photo_url": None}]

def test_upload_player_photo_prefixed_url() -> None:
    with TestClient(app) as client:
        token = admin_token(client)
        pid = client.post(
            "/players", json={"name": "Pic"}, headers={"Authorization": f"Bearer {token}"}
        ).json()["id"]
        files = {"file": ("avatar.png", PNG_BYTES, "image/png")}
        resp = client.post(
            f"/players/{pid}/photo",
            files=files,
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["photo_url"].startswith("/api/static/players/")
        filename = data["photo_url"].split("/")[-1]
        filepath = players.UPLOAD_DIR / filename
        if filepath.exists():
            filepath.unlink()


def test_upload_player_photo_too_large() -> None:
    with TestClient(app) as client:
        token = admin_token(client)
        pid = client.post(
            "/players", json={"name": "BigPic"}, headers={"Authorization": f"Bearer {token}"}
        ).json()["id"]
        big_file = PNG_BYTES + b"x" * (players.MAX_PHOTO_SIZE + 1)
        files = {"file": ("big.png", big_file, "image/png")}
        resp = client.post(
            f"/players/{pid}/photo",
            files=files,
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 413


def test_upload_player_photo_invalid_mime_type() -> None:
    with TestClient(app) as client:
        token = admin_token(client)
        pid = client.post(
            "/players", json={"name": "BadPic"}, headers={"Authorization": f"Bearer {token}"}
        ).json()["id"]
        files = {"file": ("avatar.gif", b"gif", "image/gif")}
        resp = client.post(
            f"/players/{pid}/photo", files=files, headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 415


def test_upload_player_photo_invalid_content() -> None:
    with TestClient(app) as client:
        token = admin_token(client)
        pid = client.post(
            "/players", json={"name": "BadData"}, headers={"Authorization": f"Bearer {token}"}
        ).json()["id"]
        files = {"file": ("avatar.jpg", b"not an image", "image/jpeg")}
        before = set(players.UPLOAD_DIR.glob("*"))
        resp = client.post(
            f"/players/{pid}/photo", files=files, headers={"Authorization": f"Bearer {token}"}
        )
        after = set(players.UPLOAD_DIR.glob("*"))
        assert resp.status_code == 400
        assert before == after
