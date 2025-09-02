import os, sys, asyncio, pytest

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./test_players.db"
os.environ["JWT_SECRET"] = "testsecret"
os.environ["ADMIN_SECRET"] = "admintest"

from fastapi import FastAPI
from fastapi.testclient import TestClient
from fastapi.responses import JSONResponse
from app import db
from app.routers import players, auth, badges
from app.models import Player, Club, User, Badge, PlayerBadge, PlayerMetric
from app.exceptions import DomainException, ProblemDetail

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
                ],
            )
    asyncio.run(init_models())
    yield
    if os.path.exists("./test_players.db"):
        os.remove("./test_players.db")


def admin_token(client: TestClient) -> str:
    resp = client.post(
        "/auth/signup",
        json={"username": "admin", "password": "pw", "is_admin": True},
        headers={"X-Admin-Secret": "admintest"},
    )
    if resp.status_code != 200:
        resp = client.post(
            "/auth/login", json={"username": "admin", "password": "pw"}
        )
    return resp.json()["access_token"]

def test_list_players_pagination() -> None:
    with TestClient(app) as client:
        token = admin_token(client)
        base_total = client.get("/players").json().get("total", 0)
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
        assert data == [{"id": active_id, "name": "Active"}]
