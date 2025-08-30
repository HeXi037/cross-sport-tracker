import os
import os
import sys
from pathlib import Path
import asyncio
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.append(str(Path(__file__).resolve().parents[1]))


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.anyio
async def test_create_match_by_name_rejects_duplicate_players(tmp_path):
    os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{tmp_path}/test.db"
    from app import db
    from app.models import Player
    from app.schemas import MatchCreateByName, ParticipantByName
    from app.routers.matches import create_match_by_name

    db.engine = None
    db.AsyncSessionLocal = None
    engine = db.get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Player.__table__.create)

    async with db.AsyncSessionLocal() as session:
        session.add(Player(id="p1", name="Alice"))
        await session.commit()
        body = MatchCreateByName(
            sport="padel",
            participants=[
                ParticipantByName(side="A", playerNames=["Alice"]),
                ParticipantByName(side="B", playerNames=["Alice"]),
            ],
        )
        with pytest.raises(HTTPException) as exc:
            await create_match_by_name(body, session)
        assert exc.value.status_code == 400
        assert exc.value.detail == "duplicate players: Alice"


@pytest.fixture()
def client_and_session():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async_session_maker = sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    async def init_models():
        from app.models import Sport, Match

        async with engine.begin() as conn:
            await conn.run_sync(Sport.__table__.create)
            await conn.run_sync(Match.__table__.create)

    asyncio.run(init_models())

    async def override_get_session():
        async with async_session_maker() as session:
            yield session

    from app.db import get_session
    from app.routers import matches as matches_router

    app = FastAPI()
    app.include_router(matches_router.router)
    app.dependency_overrides[get_session] = override_get_session

    with TestClient(app) as client:
        yield client, async_session_maker


def seed_sport(session_maker):
    from app.models import Sport

    async def _seed():
        async with session_maker() as session:
            session.add(Sport(id="padel", name="Padel"))
            await session.commit()

    asyncio.run(_seed())


def seed_matches(session_maker, count: int):
    from app.models import Match

    async def _seed():
        async with session_maker() as session:
            for i in range(count):
                session.add(Match(id=f"m{i}", sport_id="padel"))
            await session.commit()

    asyncio.run(_seed())


def test_list_matches_pagination(client_and_session):
    client, session_maker = client_and_session
    seed_sport(session_maker)

    base_total = client.get("/matches").json().get("total", 0)
    seed_matches(session_maker, 5)

    resp = client.get("/matches", params={"limit": 2, "offset": 1})
    assert resp.status_code == 200
    data = resp.json()
    assert data["limit"] == 2
    assert data["offset"] == 1
    assert data["total"] == base_total + 5
    assert len(data["matches"]) == 2
    assert data["nextCursor"] is not None
