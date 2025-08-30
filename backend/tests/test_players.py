import os, sys, asyncio, pytest

# Ensure the backend app modules can be imported
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Set up an in-memory SQLite database for tests
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./test_players.db"

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from app import db
from app.routers import players
from app.models import Player, Club

app = FastAPI()


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(status_code=400, content={"detail": exc.errors()})


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


def test_list_players_invalid_params() -> None:
    with TestClient(app) as client:
        resp = client.get("/players", params={"limit": 0})
        assert resp.status_code == 400
        resp = client.get("/players", params={"offset": -1})
        assert resp.status_code == 400
