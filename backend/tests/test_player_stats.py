import os, sys, asyncio
from datetime import datetime, timezone
from typing import Tuple
from types import SimpleNamespace

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from backend.app.db import get_session
from backend.app.models import (
    Player,
    Match,
    MatchAuditLog,
    MatchParticipant,
    Sport,
    ScoreEvent,
    Rating,
    GlickoRating,
    PlayerMetric,
)
from backend.app.routers import players
from backend.app.routers import matches as matches_router
from backend.app.schemas import MatchCreate, Participant
from sqlalchemy.dialects.sqlite import JSON as SQLiteJSON


@pytest.fixture()
def client_and_session():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async_session_maker = sessionmaker(
        engine, expire_on_commit=False, class_=AsyncSession
    )

    # Use JSON for ARRAY column when running on SQLite
    MatchParticipant.__table__.c.player_ids.type = SQLiteJSON()

    async def init_models():
        async with engine.begin() as conn:
            await conn.run_sync(create_table, Sport.__table__)
            await conn.run_sync(create_table, Player.__table__)
            await conn.run_sync(create_table, Match.__table__)
            await conn.run_sync(create_table, MatchAuditLog.__table__)
            await conn.run_sync(create_table, MatchParticipant.__table__)
            await conn.run_sync(create_table, ScoreEvent.__table__)
            await conn.run_sync(create_table, Rating.__table__)
            await conn.run_sync(create_table, GlickoRating.__table__)
            await conn.run_sync(create_table, PlayerMetric.__table__)

    asyncio.run(init_models())

    async def override_get_session() -> Tuple[AsyncSession, None]:
        async with async_session_maker() as session:
            yield session

    app = FastAPI()
    app.include_router(players.router)
    app.dependency_overrides[get_session] = override_get_session

    asyncio.run(players.player_stats_cache.clear())
    try:
        with TestClient(app) as client:
            yield client, async_session_maker
    finally:
        asyncio.run(players.player_stats_cache.clear())
        asyncio.run(engine.dispose())


def seed(session_maker):
    async def _seed():
        async with session_maker() as session:
            session.add(Sport(id="padel", name="Padel"))
            # Players
            session.add_all(
                [
                    Player(id="p1", name="Alice"),
                    Player(id="p2", name="Bob"),
                    Player(id="p3", name="Cara"),
                    Player(id="p4", name="Dan"),
                ]
            )
            # Match 1: p1+p2 beat p3+p4
            session.add(
                Match(id="m1", sport_id="padel", details={"sets": {"A": 2, "B": 0}})
            )
            session.add(
                MatchParticipant(
                    id="mp1", match_id="m1", side="A", player_ids=["p1", "p2"]
                )
            )
            session.add(
                MatchParticipant(
                    id="mp2", match_id="m1", side="B", player_ids=["p3", "p4"]
                )
            )
            # Match 2: p1+p3 lose to p2+p4
            session.add(
                Match(id="m2", sport_id="padel", details={"sets": {"A": 0, "B": 2}})
            )
            session.add(
                MatchParticipant(
                    id="mp3", match_id="m2", side="A", player_ids=["p1", "p3"]
                )
            )
            session.add(
                MatchParticipant(
                    id="mp4", match_id="m2", side="B", player_ids=["p2", "p4"]
                )
            )
            await session.commit()

    asyncio.run(_seed())


def seed_with_singles(session_maker):
    async def _seed():
        async with session_maker() as session:
            session.add(Sport(id="padel", name="Padel"))
            session.add_all(
                [
                    Player(id="p1", name="Alice"),
                    Player(id="p2", name="Bob"),
                    Player(id="p3", name="Cara"),
                    Player(id="p4", name="Dan"),
                ]
            )
            # Match 1: p1+p2 beat p3+p4
            session.add(
                Match(id="m1", sport_id="padel", details={"sets": {"A": 2, "B": 0}})
            )
            session.add(
                MatchParticipant(
                    id="mp1", match_id="m1", side="A", player_ids=["p1", "p2"]
                )
            )
            session.add(
                MatchParticipant(
                    id="mp2", match_id="m1", side="B", player_ids=["p3", "p4"]
                )
            )
            # Match 2: p1+p3 lose to p2+p4
            session.add(
                Match(id="m2", sport_id="padel", details={"sets": {"A": 0, "B": 2}})
            )
            session.add(
                MatchParticipant(
                    id="mp3", match_id="m2", side="A", player_ids=["p1", "p3"]
                )
            )
            session.add(
                MatchParticipant(
                    id="mp4", match_id="m2", side="B", player_ids=["p2", "p4"]
                )
            )
            # Match 3: singles p1 beats p3
            session.add(
                Match(id="m3", sport_id="padel", details={"sets": {"A": 2, "B": 1}})
            )
            session.add(
                MatchParticipant(id="mp5", match_id="m3", side="A", player_ids=["p1"])
            )
            session.add(
                MatchParticipant(id="mp6", match_id="m3", side="B", player_ids=["p3"])
            )
            await session.commit()

    asyncio.run(_seed())


def seed_with_unknown_results(session_maker):
    async def _seed():
        async with session_maker() as session:
            session.add(Sport(id="padel", name="Padel"))
            session.add_all(
                [
                    Player(id="p1", name="Alice"),
                    Player(id="p2", name="Bob"),
                    Player(id="p3", name="Cara"),
                    Player(id="p4", name="Dan"),
                ]
            )
            # Match 1: p1+p2 beat p3+p4
            session.add(
                Match(id="m1", sport_id="padel", details={"sets": {"A": 2, "B": 0}})
            )
            session.add(
                MatchParticipant(
                    id="mp1", match_id="m1", side="A", player_ids=["p1", "p2"]
                )
            )
            session.add(
                MatchParticipant(
                    id="mp2", match_id="m1", side="B", player_ids=["p3", "p4"]
                )
            )
            # Match 2: p1+p3 lose to p2+p4
            session.add(
                Match(id="m2", sport_id="padel", details={"sets": {"A": 0, "B": 2}})
            )
            session.add(
                MatchParticipant(
                    id="mp3", match_id="m2", side="A", player_ids=["p1", "p3"]
                )
            )
            session.add(
                MatchParticipant(
                    id="mp4", match_id="m2", side="B", player_ids=["p2", "p4"]
                )
            )
            # Match 3: details missing, winner unknown
            session.add(Match(id="m3", sport_id="padel"))
            session.add(
                MatchParticipant(
                    id="mp5", match_id="m3", side="A", player_ids=["p1", "p4"]
                )
            )
            session.add(
                MatchParticipant(
                    id="mp6", match_id="m3", side="B", player_ids=["p2", "p3"]
                )
            )
            await session.commit()

    asyncio.run(_seed())


def seed_with_score_only(session_maker):
    async def _seed():
        async with session_maker() as session:
            session.add(Sport(id="padel", name="Padel"))
            session.add_all(
                [
                    Player(id="p1", name="Alice"),
                    Player(id="p2", name="Bob"),
                ]
            )
            session.add(
                Match(id="m1", sport_id="padel", details={"score": {"A": 21, "B": 18}})
            )
            session.add(
                MatchParticipant(id="mp1", match_id="m1", side="A", player_ids=["p1"])
            )
            session.add(
                MatchParticipant(id="mp2", match_id="m1", side="B", player_ids=["p2"])
            )
            await session.commit()

    asyncio.run(_seed())


def test_player_stats_after_recording_padel_matches(client_and_session, monkeypatch):
    client, session_maker = client_and_session

    async def noop(*_args, **_kwargs):
        return None

    monkeypatch.setattr("backend.app.routers.matches.update_ratings", noop)
    monkeypatch.setattr("backend.app.routers.matches.update_player_metrics", noop)
    monkeypatch.setattr(
        "backend.app.routers.matches.player_stats_cache.invalidate_players", noop
    )
    monkeypatch.setattr("backend.app.routers.matches.broadcast", noop)
    monkeypatch.setattr("backend.app.routers.matches.notify_match_recorded", noop)
    monkeypatch.setattr("backend.app.routers.matches.recompute_stage_standings", noop)

    async def record_matches():
        async with session_maker() as session:
            session.add(Sport(id="padel", name="Padel"))
            session.add_all(
                [
                    Player(id="p1", name="Alice"),
                    Player(id="p2", name="Bob"),
                    Player(id="p3", name="Cara"),
                    Player(id="p4", name="Dan"),
                ]
            )
            await session.commit()

            admin = SimpleNamespace(id="admin", is_admin=True)

            first_match = MatchCreate(
                sport="padel",
                participants=[
                    Participant(side="A", playerIds=["p1", "p2"]),
                    Participant(side="B", playerIds=["p3", "p4"]),
                ],
                sets=[[6, 4], [6, 3]],
                playedAt=datetime(2024, 1, 1, tzinfo=timezone.utc),
            )
            await matches_router.create_match(first_match, session, user=admin)

            second_match = MatchCreate(
                sport="padel",
                participants=[
                    Participant(side="A", playerIds=["p1", "p3"]),
                    Participant(side="B", playerIds=["p2", "p4"]),
                ],
                sets=[[4, 6], [5, 7]],
                playedAt=datetime(2024, 1, 2, tzinfo=timezone.utc),
            )
            await matches_router.create_match(second_match, session, user=admin)

    asyncio.run(record_matches())

    resp = client.get("/players/p1/stats")
    assert resp.status_code == 200
    data = resp.json()

    assert data["matchSummary"] == {
        "total": 2,
        "wins": 1,
        "losses": 1,
        "draws": 0,
        "winPct": pytest.approx(0.5),
    }
    assert data["setSummary"] == {"won": 2, "lost": 2, "differential": 0}
    assert data["recentForm"] == {"lastFive": ["W", "L"], "currentStreak": "L1"}
    assert data["rollingWinPct"] == [1.0, 0.5]

    sf = {(entry["sport"], entry["format"]): entry for entry in data["sportFormatStats"]}
    assert sf[("padel", "doubles")]["wins"] == 1
    assert sf[("padel", "doubles")]["losses"] == 1

    assert data["bestAgainst"]["playerId"] == "p3"
    assert data["worstAgainst"]["playerId"] == "p2"
    assert data["bestWith"]["playerId"] == "p2"
    assert data["worstWith"]["playerId"] == "p3"

    records = {record["playerId"]: record for record in data["withRecords"]}
    assert records["p2"]["wins"] == 1 and records["p2"]["losses"] == 0
    assert records["p3"]["wins"] == 0 and records["p3"]["losses"] == 1

    h2h = {record["playerId"]: record for record in data["headToHeadRecords"]}
    assert h2h["p3"]["wins"] == 1 and h2h["p3"]["losses"] == 0
    assert h2h["p4"]["wins"] == 1 and h2h["p4"]["losses"] == 1
    assert h2h["p2"]["wins"] == 0 and h2h["p2"]["losses"] == 1


def test_player_stats(client_and_session):
    client, session_maker = client_and_session
    seed(session_maker)

    resp = client.get("/players/p1/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert data["bestAgainst"]["playerId"] == "p3"
    assert data["worstAgainst"]["playerId"] == "p2"
    assert data["bestWith"]["playerId"] == "p2"
    assert data["worstWith"]["playerId"] == "p3"
    assert data["bestAgainst"]["wins"] == 1
    assert data["bestWith"]["wins"] == 1
    assert data["worstAgainst"]["losses"] == 1
    assert data["worstWith"]["losses"] == 1

    assert data["matchSummary"] == {
        "total": 2,
        "wins": 1,
        "losses": 1,
        "draws": 0,
        "winPct": pytest.approx(0.5),
    }
    assert data["setSummary"] == {
        "won": 2,
        "lost": 2,
        "differential": 0,
    }
    assert data["recentForm"] == {"lastFive": ["W", "L"], "currentStreak": "L1"}

    records = {r["playerId"]: r for r in data["withRecords"]}
    assert records["p2"]["wins"] == 1
    assert records["p2"]["losses"] == 0
    assert records["p2"]["total"] == 1
    assert records["p2"]["chemistry"] == pytest.approx(1.0)
    assert records["p3"]["wins"] == 0
    assert records["p3"]["losses"] == 1
    assert records["p3"]["total"] == 1
    assert records["p3"]["chemistry"] == pytest.approx(0.0)

    # Rolling win percentage for the two matches
    assert data["rollingWinPct"] == [1.0, 0.5]
    # Sport/format stats: padel doubles with 1 win and 1 loss
    sf = data["sportFormatStats"][0]
    assert sf["sport"] == "padel"
    assert sf["format"] == "doubles"
    assert sf["wins"] == 1 and sf["losses"] == 1
    assert sf["winPct"] == 0.5
    # Streak summary
    assert data["streaks"]["current"] == -1
    assert data["streaks"]["longestWin"] == 1
    assert data["streaks"]["longestLoss"] == 1
    assert data["topPartners"][0]["playerId"] == "p2"
    assert data["topPartners"][1]["playerId"] == "p3"

    h2h = {r["playerId"]: r for r in data["headToHeadRecords"]}
    assert h2h["p3"]["wins"] == 1 and h2h["p3"]["losses"] == 0
    assert h2h["p4"]["wins"] == 1 and h2h["p4"]["losses"] == 1
    assert h2h["p2"]["wins"] == 0 and h2h["p2"]["losses"] == 1
    assert data["ratings"] == []


def test_player_stats_postgresql_json_handling(client_and_session, monkeypatch):
    """Ensure the Postgres code path works without relying on the removed JSON text helper."""

    client, session_maker = client_and_session
    seed(session_maker)

    # Simulate PostgreSQL JSONB helpers by reusing SQLite JSON functions.
    monkeypatch.setattr(
        players.func,
        "jsonb_array_elements",
        players.func.json_each,
        raising=False,
    )
    monkeypatch.setattr(
        players.func,
        "jsonb_array_elements_text",
        players.func.json_each,
        raising=False,
    )
    monkeypatch.setattr(
        players.func,
        "jsonb_array_length",
        players.func.json_array_length,
        raising=False,
    )

    async def compute():
        async with session_maker() as session:
            session.bind.dialect.name = "postgresql"
            return await players._compute_player_stats(session, "p1", span=10)

    stats = asyncio.run(compute())

    assert stats.matchSummary.total == 2
    assert stats.bestAgainst and stats.bestAgainst.playerId == "p3"
    assert stats.bestWith and stats.bestWith.playerId == "p2"


def test_player_stats_with_singles(client_and_session):
    client, session_maker = client_and_session
    seed_with_singles(session_maker)

    resp = client.get("/players/p1/stats")
    assert resp.status_code == 200
    data = resp.json()

    sf = { (s["sport"], s["format"]): s for s in data["sportFormatStats"] }
    assert sf[("padel", "doubles")]["wins"] == 1
    assert sf[("padel", "doubles")]["losses"] == 1
    assert sf[("padel", "singles")]["wins"] == 1
    assert sf[("padel", "singles")]["losses"] == 0


def test_player_stats_ignores_matches_without_winner(client_and_session):
    client, session_maker = client_and_session
    seed_with_unknown_results(session_maker)

    resp = client.get("/players/p1/stats")
    assert resp.status_code == 200
    data = resp.json()

    # Only the two matches with a known outcome should be counted
    assert data["rollingWinPct"] == [1.0, 0.5]
    sf = data["sportFormatStats"][0]
    assert sf["wins"] == 1 and sf["losses"] == 1
    records = {r["playerId"]: r for r in data["withRecords"]}
    assert "p4" not in records


def test_player_stats_handles_score_only_matches(client_and_session):
    client, session_maker = client_and_session
    seed_with_score_only(session_maker)

    resp = client.get("/players/p1/stats")
    assert resp.status_code == 200
    data = resp.json()

    assert data["matchSummary"]["total"] == 1
    assert data["matchSummary"]["wins"] == 1
    assert data["matchSummary"]["losses"] == 0
    assert data["matchSummary"]["draws"] == 0

    assert data["sportFormatStats"][0]["wins"] == 1
    assert data["sportFormatStats"][0]["losses"] == 0

    head_to_head = {r["playerId"]: r for r in data["headToHeadRecords"]}
    assert head_to_head["p2"]["wins"] == 1
    assert head_to_head["p2"]["losses"] == 0

def test_player_stats_caches_results(client_and_session, monkeypatch):
    client, session_maker = client_and_session
    seed(session_maker)

    call_count = 0
    original = players._compute_player_stats

    async def counting_compute(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        return await original(*args, **kwargs)

    monkeypatch.setattr(players, "_compute_player_stats", counting_compute)

    resp = client.get("/players/p1/stats")
    assert resp.status_code == 200
    assert call_count == 1

    resp = client.get("/players/p1/stats")
    assert resp.status_code == 200
    assert call_count == 1


def test_player_stats_cache_invalidation(client_and_session, monkeypatch):
    client, session_maker = client_and_session
    seed(session_maker)

    call_count = 0
    original = players._compute_player_stats

    async def counting_compute(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        return await original(*args, **kwargs)

    monkeypatch.setattr(players, "_compute_player_stats", counting_compute)

    resp = client.get("/players/p1/stats")
    assert resp.status_code == 200
    assert call_count == 1

    resp = client.get("/players/p1/stats")
    assert resp.status_code == 200
    assert call_count == 1

    async def flip_result():
        async with session_maker() as session:
            match = await session.get(Match, "m1")
            match.details = {"sets": {"A": 0, "B": 2}}
            await session.commit()

    asyncio.run(flip_result())
    asyncio.run(players.player_stats_cache.invalidate_players(["p1"]))

    resp = client.get("/players/p1/stats")
    assert resp.status_code == 200
    assert call_count == 2
    assert resp.json()["rollingWinPct"] == [0.0, 0.0]


def test_player_stats_rating_timestamps_include_timezone(client_and_session):
    client, session_maker = client_and_session
    seed(session_maker)

    naive_event_ts = datetime(2024, 1, 5, 12, 30, 0)
    naive_rating_ts = datetime(2024, 1, 6, 8, 15, 0)

    async def add_rating_data():
        async with session_maker() as session:
            session.add(
                ScoreEvent(
                    id="se1",
                    match_id="m1",
                    type="RATING",
                    created_at=naive_event_ts,
                    payload={
                        "playerId": "p1",
                        "systems": {
                            "elo": {"rating": 1010.0},
                            "glicko": {"rating": 1520.0, "rd": 110.0},
                        },
                    },
                )
            )
            session.add(
                Rating(
                    id="r1",
                    player_id="p1",
                    sport_id="padel",
                    value=1010.0,
                )
            )
            session.add(
                GlickoRating(
                    id="g1",
                    player_id="p1",
                    sport_id="padel",
                    rating=1520.0,
                    rd=110.0,
                    last_updated=naive_rating_ts,
                )
            )
            await session.commit()

    asyncio.run(add_rating_data())

    resp = client.get("/players/p1/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ratings"], "Expected ratings data in stats response"
    padel_rating = next((entry for entry in data["ratings"] if entry["sport"] == "padel"), None)
    assert padel_rating is not None

    def _has_timezone(value: str | None) -> bool:
        if not value:
            return False
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return False
        return parsed.tzinfo is not None and parsed.utcoffset() is not None

    elo_snapshot = padel_rating.get("elo") or {}
    assert _has_timezone(elo_snapshot.get("lastUpdated"))

    glicko_snapshot = padel_rating.get("glicko") or {}
    assert _has_timezone(glicko_snapshot.get("lastUpdated"))
