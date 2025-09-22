import os, sys, asyncio
from typing import Tuple

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from backend.app.db import get_session
from backend.app.models import Player, Match, MatchParticipant, Sport
from backend.app.routers import players
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
            await conn.run_sync(Sport.__table__.create)
            await conn.run_sync(Player.__table__.create)
            await conn.run_sync(Match.__table__.create)
            await conn.run_sync(MatchParticipant.__table__.create)

    asyncio.run(init_models())

    async def override_get_session() -> Tuple[AsyncSession, None]:
        async with async_session_maker() as session:
            yield session

    app = FastAPI()
    app.include_router(players.router)
    app.dependency_overrides[get_session] = override_get_session

    asyncio.run(players.player_stats_cache.clear())
    with TestClient(app) as client:
        yield client, async_session_maker
    asyncio.run(players.player_stats_cache.clear())


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

    records = {r["playerId"]: r for r in data["withRecords"]}
    assert records["p2"]["wins"] == 1
    assert records["p2"]["losses"] == 0
    assert records["p3"]["wins"] == 0
    assert records["p3"]["losses"] == 1

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
