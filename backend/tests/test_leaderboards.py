import os, sys, asyncio, pytest

# Ensure backend app modules can be imported
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Set up an in-memory SQLite database for tests
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./test_leaderboards.db"

from fastapi import FastAPI
from fastapi.testclient import TestClient
from app import db
from app.routers import leaderboards
from app.models import Player, Rating, Sport, Match, MatchParticipant

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
            # SQLite lacks ARRAY support required for MatchParticipant.player_ids.
            # Create the core tables using SQLAlchemy metadata, then manually
            # define a minimal match_participant table with TEXT player_ids so
            # the leaderboard queries can run without exercising ARRAY features.
            await conn.run_sync(
                db.Base.metadata.create_all,
                tables=[Sport.__table__, Player.__table__, Rating.__table__, Match.__table__],
            )
            await conn.exec_driver_sql(
                """
                CREATE TABLE match_participant (
                    id TEXT PRIMARY KEY,
                    match_id TEXT,
                    side TEXT,
                    player_ids TEXT
                )
                """
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
        # No matches yet, so set stats should be zero
        for entry in data["leaders"]:
            assert entry["sets"] == 0
            assert entry["setsWon"] == 0
            assert entry["setsLost"] == 0
            assert entry["setDiff"] == 0


def test_leaderboard_sets():
    pytest.skip("SQLite lacks ARRAY support for MatchParticipant")
    async def seed_match():
        async with db.AsyncSessionLocal() as session:
            match = Match(id="m1", sport_id="padel", details={"sets": {"A": 2, "B": 1}})
            session.add(match)
            session.add_all(
                [
                    MatchParticipant(
                        id="pa", match_id="m1", side="A", player_ids=["0"]
                    ),
                    MatchParticipant(
                        id="pb", match_id="m1", side="B", player_ids=["1"]
                    ),
                ]
            )
            await session.commit()

    asyncio.run(seed_match())

    with TestClient(app) as client:
        resp = client.get("/leaderboards", params={"sport": "padel", "limit": 5})
        assert resp.status_code == 200
        data = resp.json()
        leaders = {l["playerId"]: l for l in data["leaders"]}
        p0 = leaders["0"]
        assert p0["sets"] == 3
        assert p0["setsWon"] == 2
        assert p0["setsLost"] == 1
        assert p0["setDiff"] == 1
        assert p0["rank"] == 5
        assert p0["rankChange"] == 0
        p1 = leaders["1"]
        assert p1["sets"] == 3
        assert p1["setsWon"] == 1
        assert p1["setsLost"] == 2
        assert p1["setDiff"] == -1
        assert p1["rank"] == 4
        assert p1["rankChange"] == 0
