import os
import sys
import asyncio

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy.dialects.sqlite import JSON as SQLiteJSON

from backend.app.db import get_session
from backend.app.models import Player, Match, MatchParticipant, Sport
from backend.app.routes import player as player_pages
from backend.app.routers import players


@pytest.fixture()
def player_profile_client():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async_session_maker = sessionmaker(
        engine, expire_on_commit=False, class_=AsyncSession
    )

    # Use SQLite JSON type for compatibility with MatchParticipant.player_ids
    MatchParticipant.__table__.c.player_ids.type = SQLiteJSON()

    async def init_models():
        async with engine.begin() as conn:
            await conn.run_sync(create_table, Sport.__table__)
            await conn.run_sync(create_table, Player.__table__)
            await conn.run_sync(create_table, Match.__table__)
            await conn.run_sync(create_table, MatchParticipant.__table__)

    asyncio.run(init_models())

    async def override_get_session():
        async with async_session_maker() as session:
            yield session

    app = FastAPI()
    app.include_router(player_pages.router)
    app.dependency_overrides[get_session] = override_get_session

    try:
        asyncio.run(players.player_stats_cache.clear())
        with TestClient(app) as client:
            yield client, async_session_maker
    finally:
        asyncio.run(players.player_stats_cache.clear())
        asyncio.run(engine.dispose())


def seed_basic_match(session_maker):
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
            session.add(
                Match(
                    id="m1",
                    sport_id="padel",
                    details={"sets": {"A": 2, "B": 0}},
                )
            )
            session.add(
                MatchParticipant(
                    id="mp1",
                    match_id="m1",
                    side="A",
                    player_ids=["p1", "p2"],
                )
            )
            session.add(
                MatchParticipant(
                    id="mp2",
                    match_id="m1",
                    side="B",
                    player_ids=["p3", "p4"],
                )
            )
            await session.commit()

    asyncio.run(_seed())


def test_player_profile_includes_stats(player_profile_client):
    client, session_maker = player_profile_client
    seed_basic_match(session_maker)

    response = client.get("/players/p1")
    assert response.status_code == 200

    stats = response.context["stats"]
    assert stats.playerId == "p1"
    assert stats.matchSummary.wins == 1
    assert stats.matchSummary.total == 1
