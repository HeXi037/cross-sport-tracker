import os, sys, asyncio, pytest

# Ensure backend app modules can be imported
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Set up an in-memory SQLite database for tests
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./test_leaderboards.db"

from fastapi import FastAPI
from fastapi.testclient import TestClient
from app import db
from app.routers import leaderboards
from app.models import Player, Rating, Sport

app = FastAPI()
app.include_router(leaderboards.router)


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    async def init_models():
        if os.path.exists("./test_leaderboards.db"):
            os.remove("./test_leaderboards.db")
        db.engine = None
        db.AsyncSessionLocal = None
        engine = db.get_engine()
        async with engine.begin() as conn:
            await conn.run_sync(
                db.Base.metadata.create_all,
                tables=[Sport.__table__, Player.__table__, Rating.__table__],
            )
        async with db.AsyncSessionLocal() as session:
            sport = Sport(id="padel", name="Padel")
            session.add(sport)
            for i in range(5):
                player = Player(id=str(i), name=f"P{i}")
                rating = Rating(id=str(i), player_id=player.id, sport_id="padel", value=1000 + i)
                session.add_all([player, rating])
            await session.commit()
    asyncio.run(init_models())
    yield
    if os.path.exists("./test_leaderboards.db"):
        os.remove("./test_leaderboards.db")


def test_leaderboard_pagination():
    with TestClient(app) as client:
        resp = client.get("/leaderboards", params={"sport": "padel", "limit": 2, "offset": 1})
        assert resp.status_code == 200
        data = resp.json()
        assert data["limit"] == 2
        assert data["offset"] == 1
        assert data["total"] == 5
        assert len(data["leaders"]) == 2
        assert data["leaders"][0]["rating"] == 1003
        assert data["leaders"][0]["rank"] == 2
        assert data["leaders"][0]["rankChange"] == 0
        assert data["leaders"][1]["rating"] == 1002
        assert data["leaders"][1]["rank"] == 3
        assert data["leaders"][1]["rankChange"] == 0
