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
from sqlalchemy.dialects.sqlite import JSON

from backend.app.db import Base, get_session
from backend.app.models import Match, Sport, ScoreEvent, MatchParticipant, User
from backend.app.routers import matches
from backend.app.scoring import disc_golf
from backend.app.routers.admin import require_admin
from backend.app.routers.auth import get_current_user


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
            # MatchParticipant uses ARRAY which SQLite doesn't support; patch to JSON
            MatchParticipant.__table__.columns["player_ids"].type = JSON()
            await conn.run_sync(MatchParticipant.__table__.create)

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
    app.dependency_overrides[get_current_user] = lambda: User(
        id="u1", username="admin", password_hash="", is_admin=True
    )
    app.dependency_overrides[require_admin] = lambda: None

    with TestClient(app) as client:
        yield client, async_session_maker
def test_create_and_append_event_hole(client_and_session):
    client, session_maker = client_and_session

    async def seed_sport():
        async with session_maker() as session:
            session.add(Sport(id="disc_golf", name="Disc Golf"))
            await session.commit()

    asyncio.run(seed_sport())

    # create match via API
    resp = client.post(
        "/matches",
        json={
            "sport": "disc_golf",
            "participants": [
                {"side": "A", "playerIds": []},
                {"side": "B", "playerIds": []},
            ],
        },
    )
    assert resp.status_code == 200
    mid = resp.json()["id"]

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
