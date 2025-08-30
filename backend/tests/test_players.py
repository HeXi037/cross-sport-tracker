import os, sys, asyncio, pytest

# Ensure the backend app modules can be imported
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Set up an in-memory SQLite database for tests
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./test_players.db"

from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.db import Base, engine
from app.routers import players
from app.models import Player, Club

app = FastAPI()
app.include_router(players.router)

@pytest.fixture(scope="module", autouse=True)
def setup_db():
    async def init_models():
        async with engine.begin() as conn:
            await conn.run_sync(
                Base.metadata.create_all,
                tables=[Club.__table__, Player.__table__],
            )
    asyncio.run(init_models())
    yield
    if os.path.exists("./test_players.db"):
        os.remove("./test_players.db")

def test_list_players_pagination() -> None:
    with TestClient(app) as client:
        # Create some players
        for i in range(5):
            resp = client.post("/players", json={"name": f"P{i}"})
            assert resp.status_code == 200
        # Request a limited subset
        resp = client.get("/players", params={"limit": 2, "offset": 1})
        assert resp.status_code == 200
        data = resp.json()
        assert data["limit"] == 2
        assert data["offset"] == 1
        assert data["total"] == 5
        assert len(data["players"]) == 2
