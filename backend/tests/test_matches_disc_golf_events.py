import os, sys, asyncio
from typing import Tuple

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy import select

from backend.app.db import Base, get_session
from backend.app.models import Match, Sport, ScoreEvent
from backend.app.routers import matches
from backend.app.scoring import disc_golf
from backend.app.routers.admin import require_admin


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

    async def init_models():
        async with engine.begin() as conn:
            await conn.run_sync(Sport.__table__.create)
            await conn.run_sync(Match.__table__.create)
            await conn.run_sync(ScoreEvent.__table__.create)

    asyncio.run(init_models())

    async def override_get_session() -> Tuple[AsyncSession, None]:
        async with async_session_maker() as session:
            yield session

    async def dummy_broadcast(mid: str, message: dict) -> None:
        return None

    matches.broadcast = dummy_broadcast
    matches.importlib.import_module = lambda *args, **kwargs: disc_golf

    app = FastAPI()
    app.include_router(matches.router)
    app.dependency_overrides[get_session] = override_get_session
    app.dependency_overrides[require_admin] = lambda: None

    with TestClient(app) as client:
        yield client, async_session_maker


def seed_match(session_maker, mid: str) -> None:
    async def _seed():
        async with session_maker() as session:
            session.add(Sport(id="disc_golf", name="Disc Golf"))
            session.add(Match(id=mid, sport_id="disc_golf"))
            await session.commit()

    asyncio.run(_seed())


def test_append_event_hole(client_and_session):
    client, session_maker = client_and_session
    mid = "dg1"
    seed_match(session_maker, mid)

    resp = client.post(
        f"/matches/{mid}/events",
        json={"type": "HOLE", "side": "A", "hole": 1, "strokes": 3},
    )
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
        "type": "HOLE",
        "by": None,
        "pins": None,
        "side": "A",
        "hole": 1,
        "strokes": 3,
    }
    assert summary["scores"]["A"][0] == 3
