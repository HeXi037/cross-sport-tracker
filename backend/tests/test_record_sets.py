import os, sys, asyncio
from typing import Tuple

# Ensure the app package is importable and the DB URL is set for module import
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy import select

from backend.app.db import Base, get_session
from backend.app.models import (
    Match,
    Sport,
    ScoreEvent,
    MatchParticipant,
    Player,
    Rating,
    User,
)
from backend.app.routers import matches
from backend.app.scoring import padel
from backend.app.routers.admin import require_admin
from backend.app.routers.auth import get_current_user


@pytest.fixture()
def client_and_session():
    """Create a FastAPI TestClient with an in-memory SQLite database."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async_session_maker = sessionmaker(
        engine, expire_on_commit=False, class_=AsyncSession
    )

    async def init_models():
        async with engine.begin() as conn:
            await conn.run_sync(Sport.__table__.create)
            await conn.run_sync(Match.__table__.create)
            await conn.run_sync(MatchParticipant.__table__.create)
            await conn.run_sync(ScoreEvent.__table__.create)
            await conn.run_sync(Player.__table__.create)
            await conn.run_sync(Rating.__table__.create)

    asyncio.run(init_models())

    async def override_get_session() -> Tuple[AsyncSession, None]:
        async with async_session_maker() as session:
            yield session

    async def dummy_broadcast(mid: str, message: dict) -> None:  # noqa: D401
        return None

    matches.broadcast = dummy_broadcast
    matches.importlib.import_module = lambda *args, **kwargs: padel

    app = FastAPI()
    app.include_router(matches.router)
    app.dependency_overrides[get_session] = override_get_session
    app.dependency_overrides[require_admin] = lambda: None
    app.dependency_overrides[get_current_user] = lambda: User(
        id="u", username="u", password_hash="", is_admin=True
    )

    with TestClient(app) as client:
        yield client, async_session_maker


def seed_match(session_maker, mid: str) -> None:
    async def _seed():
        async with session_maker() as session:
            session.add(Sport(id="padel", name="Padel"))
            session.add(Match(id=mid, sport_id="padel"))
            await session.commit()

    asyncio.run(_seed())


def test_record_sets_success(client_and_session):
    client, session_maker = client_and_session
    mid = "m1"
    seed_match(session_maker, mid)

    resp = client.post(f"/matches/{mid}/sets", json={"sets": [[6, 4], [6, 2]]})
    assert resp.status_code == 200
    data = resp.json()
    expected = len(padel.record_sets([(6, 4), (6, 2)])[0])
    assert data == {"ok": True, "added": expected}

    async def fetch_summary():
        async with session_maker() as session:
            match = await session.get(Match, mid)
            return match.details

    summary = asyncio.run(fetch_summary())
    assert summary["sets"] == {"A": 2, "B": 0}


def test_record_sets_tiebreak_updates_summary_and_ratings(client_and_session):
    client, session_maker = client_and_session
    mid = "m_tb"
    seed_match(session_maker, mid)

    async def seed_players_and_participants():
        async with session_maker() as session:
            session.add_all(
                [
                    Player(id="pa", name="Player A"),
                    Player(id="pb", name="Player B"),
                    MatchParticipant(
                        id="mpa", match_id=mid, side="A", player_ids=["pa"]
                    ),
                    MatchParticipant(
                        id="mpb", match_id=mid, side="B", player_ids=["pb"]
                    ),
                ]
            )
            await session.commit()

    asyncio.run(seed_players_and_participants())

    resp = client.post(f"/matches/{mid}/sets", json={"sets": [[7, 6]]})
    assert resp.status_code == 200
    expected = len(padel.record_sets([(7, 6)])[0])
    assert resp.json() == {"ok": True, "added": expected}

    async def fetch_summary_and_ratings():
        async with session_maker() as session:
            match = await session.get(Match, mid)
            ratings = (
                await session.execute(
                    select(Rating).where(Rating.player_id.in_(["pa", "pb"]))
                )
            ).scalars().all()
            return match.details, {r.player_id: r.value for r in ratings}

    summary, rating_map = asyncio.run(fetch_summary_and_ratings())
    assert summary["sets"] == {"A": 1, "B": 0}
    assert set(rating_map) == {"pa", "pb"}
    assert rating_map["pa"] > rating_map["pb"]
    assert rating_map["pa"] > 1000
    assert rating_map["pb"] < 1000


def test_record_sets_invalid(client_and_session):
    client, session_maker = client_and_session
    mid = "m2"
    seed_match(session_maker, mid)

    resp = client.post(f"/matches/{mid}/sets", json={"sets": [[6, 6]]})
    assert resp.status_code == 422


def test_append_event_point(client_and_session):
    client, session_maker = client_and_session
    mid = "m3"
    seed_match(session_maker, mid)

    resp = client.post(f"/matches/{mid}/events", json={"type": "POINT", "by": "A"})
    assert resp.status_code == 200

    async def fetch():
        async with session_maker() as session:
            events = (
                await session.execute(
                    select(ScoreEvent).where(ScoreEvent.match_id == mid)
                )
            ).scalars().all()
            match = await session.get(Match, mid)
            return events, match.details

    events, summary = asyncio.run(fetch())
    assert len(events) == 1
    assert events[0].payload == {
        "type": "POINT",
        "by": "A",
        "pins": None,
        "side": None,
        "hole": None,
        "strokes": None,
    }
    assert summary["points"] == {"A": 1, "B": 0}

