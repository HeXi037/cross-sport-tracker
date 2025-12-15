import os, sys, asyncio
from typing import Tuple

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from slowapi.errors import RateLimitExceeded
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy.dialects.sqlite import JSON as SQLiteJSON

from backend.app.db import get_session
from backend.app.models import (
    GlickoRating,
    Player,
    Match,
    MatchParticipant,
    Sport,
    PlayerMetric,
    Rating,
    ScoreEvent,
    User,
)
from backend.app.routers import players, matches, auth
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

    MatchParticipant.__table__.c.player_ids.type = SQLiteJSON()

    async def init_models():
        async with engine.begin() as conn:
            await conn.run_sync(create_table, Sport.__table__)
            await conn.run_sync(create_table, Player.__table__)
            await conn.run_sync(create_table, Match.__table__)
            await conn.run_sync(create_table, MatchParticipant.__table__)
            await conn.run_sync(create_table, ScoreEvent.__table__)
            await conn.run_sync(create_table, PlayerMetric.__table__)
            await conn.run_sync(create_table, Rating.__table__)
            await conn.run_sync(create_table, GlickoRating.__table__)

    asyncio.run(init_models())

    async def override_get_session() -> Tuple[AsyncSession, None]:
        async with async_session_maker() as session:
            yield session

    async def dummy_broadcast(mid: str, message: dict) -> None:
        return None

    matches.broadcast = dummy_broadcast

    app = FastAPI()
    app.state.limiter = auth.limiter
    app.add_exception_handler(RateLimitExceeded, auth.rate_limit_handler)
    app.include_router(players.router)
    app.include_router(matches.router)
    app.dependency_overrides[get_session] = override_get_session
    app.dependency_overrides[require_admin] = lambda: None
    app.dependency_overrides[get_current_user] = lambda: User(
        id="u", username="u", password_hash="", is_admin=True
    )

    with TestClient(app) as client:
        try:
            yield client, async_session_maker
        finally:
            asyncio.run(engine.dispose())


def seed(session_maker):
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
            session.add(Match(id="m1", sport_id="padel"))
            session.add(
                MatchParticipant(id="mp1", match_id="m1", side="A", player_ids=["p1", "p2"])
            )
            session.add(
                MatchParticipant(id="mp2", match_id="m1", side="B", player_ids=["p3", "p4"])
            )
            await session.commit()

    asyncio.run(_seed())


def test_metrics_and_milestones(client_and_session):
    client, session_maker = client_and_session
    seed(session_maker)

    resp = client.post("/matches/m1/sets", json={"sets": [[6, 1], [6, 0]]})
    assert resp.status_code == 200

    data = client.get("/players/p1").json()
    assert data["metrics"]["padel"]["wins"] == 1
    assert "firstWin" in data["milestones"]["padel"]

    data_loser = client.get("/players/p3").json()
    assert data_loser["metrics"]["padel"]["losses"] == 1
