import os, sys, asyncio, pytest

# Ensure the backend app modules can be imported
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Set up an in-memory SQLite database for tests
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./test_players.db"

from fastapi import FastAPI
from fastapi.testclient import TestClient
from fastapi.responses import JSONResponse
from app import db
from app.routers import players
from app.models import Player, Club
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


app.include_router(players.router)

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
                tables=[Club.__table__, Player.__table__],
            )
    asyncio.run(init_models())
    yield
    if os.path.exists("./test_players.db"):
        os.remove("./test_players.db")

def test_list_players_pagination() -> None:
    with TestClient(app) as client:
        # Track existing players and create some new ones
        base_total = client.get("/players").json().get("total", 0)
        for i in range(5):
            resp = client.post("/players", json={"name": f"P{i}"})
            assert resp.status_code == 200
        # Request a limited subset
        resp = client.get("/players", params={"limit": 2, "offset": 1})
        assert resp.status_code == 200
        data = resp.json()
        assert data["limit"] == 2
        assert data["offset"] == 1
        assert data["total"] == base_total + 5
        assert len(data["players"]) == 2


def test_delete_player_requires_secret() -> None:
    os.environ["ADMIN_SECRET"] = "s3cr3t"
    with TestClient(app) as client:
        pid = client.post("/players", json={"name": "Alice"}).json()["id"]
        resp = client.delete(f"/players/{pid}")
        assert resp.status_code == 401


def test_delete_player_soft_delete() -> None:
    os.environ["ADMIN_SECRET"] = "s3cr3t"
    with TestClient(app, raise_server_exceptions=False) as client:
        pid = client.post("/players", json={"name": "Bob"}).json()["id"]
        resp = client.delete(
            f"/players/{pid}", headers={"X-Admin-Secret": "s3cr3t"}
        )
        assert resp.status_code == 204
        assert client.get(f"/players/{pid}").status_code == 404

    async def check_deleted():
        async with db.AsyncSessionLocal() as session:
            p = await session.get(Player, pid)
            assert p is not None and p.deleted_at is not None

    asyncio.run(check_deleted())
