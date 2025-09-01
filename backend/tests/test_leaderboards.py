import os
import sys
import asyncio
from datetime import datetime, timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.dialects.sqlite import JSON

# Ensure backend app modules can be imported
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Configure database for tests
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./test_leaderboards.db"

from app import db  # noqa: E402
from app.models import (
    Player,
    Rating,
    Sport,
    Match,
    MatchParticipant,
    ScoreEvent,
)  # noqa: E402
from app.routers import leaderboards  # noqa: E402

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
        # Patch player_ids to use JSON for SQLite
        MatchParticipant.__table__.columns["player_ids"].type = JSON()
        async with engine.begin() as conn:
            await conn.run_sync(
                db.Base.metadata.create_all,
                tables=[
                    Sport.__table__,
                    Player.__table__,
                    Rating.__table__,
                    Match.__table__,
                    ScoreEvent.__table__,
                ],
            )
            await conn.exec_driver_sql(
                """
                CREATE TABLE match_participant (
                    id TEXT PRIMARY KEY,
                    match_id TEXT,
                    side TEXT,
                    player_ids JSON
                )
                """
            )
        async with db.AsyncSessionLocal() as session:
            sport = Sport(id="padel", name="Padel")
            session.add(sport)
            p1 = Player(id="p1", name="P1")
            p2 = Player(id="p2", name="P2")
            session.add_all([p1, p2])
            session.add_all(
                [
                    Rating(id="r1", player_id="p1", sport_id="padel", value=1005),
                    Rating(id="r2", player_id="p2", sport_id="padel", value=1001),
                ]
            )
            base = datetime(2024, 1, 1)
            for idx in range(6):
                mid = f"m{idx}"
                details = {"sets": {"A": 2, "B": 1}} if idx == 5 else None
                session.add(Match(id=mid, sport_id="padel", details=details))
                session.add_all(
                    [
                        ScoreEvent(
                            id=f"e1{idx}",
                            match_id=mid,
                            created_at=base + timedelta(minutes=idx * 2),
                            type="RATING",
                            payload={"playerId": "p1", "rating": 1000 + idx},
                        ),
                        ScoreEvent(
                            id=f"e2{idx}",
                            match_id=mid,
                            created_at=base + timedelta(minutes=idx * 2 + 1),
                            type="RATING",
                            payload={"playerId": "p2", "rating": 1006 - idx},
                        ),
                    ]
                )
                if idx == 5:
                    session.add_all(
                        [
                            MatchParticipant(
                                id="pa", match_id=mid, side="A", player_ids=["p1"]
                            ),
                            MatchParticipant(
                                id="pb", match_id=mid, side="B", player_ids=["p2"]
                            ),
                        ]
                    )
            await session.commit()

    asyncio.run(init_models())
    yield
    if os.path.exists("./test_leaderboards.db"):
        os.remove("./test_leaderboards.db")


def test_leaderboard_rank_and_sets():
    with TestClient(app) as client:
        resp = client.get("/leaderboards", params={"sport": "padel"})
        assert resp.status_code == 200
        data = resp.json()
        leaders = {l["playerId"]: l for l in data["leaders"]}
        p1 = leaders["p1"]
        assert p1["rank"] == 1
        assert p1["rankChange"] == 1
        assert p1["setsWon"] == 2
        assert p1["setsLost"] == 1
        p2 = leaders["p2"]
        assert p2["rank"] == 2
        assert p2["rankChange"] == -1
        assert p2["setsWon"] == 1
        assert p2["setsLost"] == 2
