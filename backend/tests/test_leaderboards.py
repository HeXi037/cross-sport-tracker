import os
import sys
import asyncio
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.dialects.sqlite import JSON

# Ensure backend app modules can be imported
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Configure database for tests

from app import db  # noqa: E402
from app.models import (
    Club,
    Player,
    Rating,
    Sport,
    Match,
    MatchParticipant,
    ScoreEvent,
    MasterRating,
    Stage,
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
                    Club.__table__,
                    Player.__table__,
                    Rating.__table__,
                    Stage.__table__,
                    Match.__table__,
                    ScoreEvent.__table__,
                    MasterRating.__table__,
                ],
            )
            await conn.exec_driver_sql("DROP TABLE IF EXISTS match_participant")
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
            session.add(Sport(id="bowling", name="Bowling"))
            session.add_all(
                [
                    Club(id="club-a", name="Club A"),
                    Club(id="club-b", name="Club B"),
                ]
            )
            p1 = Player(id="p1", name="P1", location="SE", club_id="club-a")
            p2 = Player(id="p2", name="P2", location="SE", club_id="club-b")
            p3 = Player(id="p3", name="P3", location="NO", club_id="club-a")
            p4 = Player(id="p4", name="P4", location="US")
            session.add_all([p1, p2, p3, p4])
            session.add_all(
                [
                    Player(id="b1", name="Bowler One"),
                    Player(id="b2", name="Bowler Two"),
                    Player(id="b3", name="Bowler Three"),
                ]
            )
            session.add_all(
                [
                    Rating(id="r1", player_id="p1", sport_id="padel", value=1005),
                    Rating(id="r2", player_id="p2", sport_id="padel", value=1001),
                    Rating(id="r3", player_id="p3", sport_id="padel", value=990),
                    Rating(id="r4", player_id="p4", sport_id="padel", value=980),
                    Rating(id="br1", player_id="b1", sport_id="bowling", value=1010),
                    Rating(id="br2", player_id="b2", sport_id="bowling", value=1000),
                    Rating(id="br3", player_id="b3", sport_id="bowling", value=990),
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

            bowling_matches = [
                (
                    "bm1",
                    {
                        "players": [
                            {"id": "b1", "side": "A", "total": 220},
                            {"id": "b2", "side": "B", "total": 180},
                        ],
                        "score": {"A": 220, "B": 180},
                    },
                ),
                (
                    "bm2",
                    {
                        "players": [
                            {"id": "b1", "side": "A", "total": 210},
                            {"id": "b3", "side": "B", "total": 190},
                        ],
                        "score": {"A": 210, "B": 190},
                    },
                ),
            ]

            for idx, (mid, details) in enumerate(bowling_matches):
                session.add(Match(id=mid, sport_id="bowling", details=details))
                session.add_all(
                    [
                        ScoreEvent(
                            id=f"be{idx}a",
                            match_id=mid,
                            created_at=base + timedelta(hours=idx),
                            type="RATING",
                            payload={"playerId": "b1", "rating": 1005 + idx},
                        ),
                        ScoreEvent(
                            id=f"be{idx}b",
                            match_id=mid,
                            created_at=base + timedelta(hours=idx, minutes=30),
                            type="RATING",
                            payload={
                                "playerId": "b2" if idx == 0 else "b3",
                                "rating": 995 - idx,
                            },
                        ),
                    ]
                )

            session.add_all(
                [
                    MatchParticipant(
                        id="bmp1", match_id="bm1", side="A", player_ids=["b1"]
                    ),
                    MatchParticipant(
                        id="bmp2", match_id="bm1", side="B", player_ids=["b2"]
                    ),
                    MatchParticipant(
                        id="bmp3", match_id="bm2", side="A", player_ids=["b1"]
                    ),
                    MatchParticipant(
                        id="bmp4", match_id="bm2", side="B", player_ids=["b3"]
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


def test_leaderboard_ignores_deleted_match_events():
    deleted_time = datetime.now(timezone.utc)

    async def soft_delete():
        async with db.AsyncSessionLocal() as session:
            match = await session.get(Match, "m0")
            match.deleted_at = deleted_time
            await session.commit()

    async def restore():
        async with db.AsyncSessionLocal() as session:
            match = await session.get(Match, "m0")
            match.deleted_at = None
            await session.commit()

    asyncio.run(soft_delete())
    try:
        with TestClient(app) as client:
            resp = client.get("/leaderboards", params={"sport": "padel"})
            assert resp.status_code == 200
            data = resp.json()
            leaders = {entry["playerId"]: entry for entry in data["leaders"]}
            assert leaders["p1"]["rankChange"] == 0
            assert leaders["p2"]["rankChange"] == 0
    finally:
        asyncio.run(restore())


def test_leaderboard_filter_by_country():
    with TestClient(app) as client:
        resp = client.get(
            "/leaderboards", params={"sport": "padel", "country": "SE"}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 2
        leaders = data["leaders"]
        assert [entry["playerId"] for entry in leaders] == ["p1", "p2"]
        assert [entry["rank"] for entry in leaders] == [1, 2]


def test_leaderboard_filter_by_club():
    with TestClient(app) as client:
        resp = client.get(
            "/leaderboards", params={"sport": "padel", "clubId": "club-a"}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 2
        leaders = data["leaders"]
        assert [entry["playerId"] for entry in leaders] == ["p1", "p3"]
        assert [entry["rank"] for entry in leaders] == [1, 2]


def test_master_leaderboard_excludes_deleted_players():
    async def delete_player():
        async with db.AsyncSessionLocal() as session:
            player = await session.get(Player, "p4")
            player.deleted_at = datetime.now(timezone.utc)
            await session.commit()

    asyncio.run(delete_player())
    with TestClient(app) as client:
        resp = client.get("/leaderboards/master")
        assert resp.status_code == 200
        data = resp.json()
        leaders = data["leaders"]
        assert "p4" not in [entry["playerId"] for entry in leaders]
        assert data["total"] == len(leaders) == 6


def test_bowling_leaderboard_includes_score_stats():
    with TestClient(app) as client:
        resp = client.get("/leaderboards", params={"sport": "bowling"})
        assert resp.status_code == 200
        data = resp.json()
        leaders = {entry["playerId"]: entry for entry in data["leaders"]}
        assert leaders["b1"]["matchesPlayed"] == 2
        assert leaders["b1"]["highestScore"] == 220
        assert leaders["b1"]["averageScore"] == pytest.approx(215.0)
        assert leaders["b1"]["standardDeviation"] == pytest.approx(5.0)
        assert leaders["b2"]["matchesPlayed"] == 1
        assert leaders["b2"]["highestScore"] == 180
        assert leaders["b2"]["averageScore"] == pytest.approx(180.0)
        assert leaders["b2"]["standardDeviation"] == pytest.approx(0.0)
        assert leaders["b3"]["matchesPlayed"] == 1
        assert leaders["b3"]["highestScore"] == 190
        assert leaders["b3"]["averageScore"] == pytest.approx(190.0)
        assert leaders["b3"]["standardDeviation"] == pytest.approx(0.0)
