import asyncio
import os
import sys
from collections.abc import Iterable

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.append(
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
)

from backend.app.db import Base, get_session
from backend.app.models import Sport
from backend.app.routers import sports


@pytest.fixture()
def sports_client():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async_session_maker = sessionmaker(
        engine, expire_on_commit=False, class_=AsyncSession
    )

    async def init_schema() -> None:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all, tables=[Sport.__table__])

    asyncio.run(init_schema())

    async def override_get_session() -> Iterable[AsyncSession]:
        async with async_session_maker() as session:
            yield session

    app = FastAPI()
    app.include_router(sports.router, prefix="/api/v0")
    app.dependency_overrides[get_session] = override_get_session

    with TestClient(app) as client:
        yield client, async_session_maker

    app.dependency_overrides.clear()
    asyncio.run(engine.dispose())


def test_list_sports_includes_configured_defaults(sports_client):
    client, session_maker = sports_client

    async def seed_partial_catalog() -> None:
        async with session_maker() as session:
            session.add_all(
                [
                    Sport(id="padel", name="Padel"),
                    Sport(id="padel_americano", name="Padel Americano"),
                    Sport(id="bowling", name="Bowling"),
                ]
            )
            await session.commit()

    asyncio.run(seed_partial_catalog())

    response = client.get("/api/v0/sports")
    assert response.status_code == 200

    payload = response.json()
    assert isinstance(payload, list)

    catalog = {entry["id"]: entry["name"] for entry in payload}

    expected_ids = {
        "padel",
        "padel_americano",
        "bowling",
        "tennis",
        "pickleball",
        "table_tennis",
        "disc_golf",
    }

    for sport_id in expected_ids:
        assert sport_id in catalog, f"Expected sport {sport_id} to be present"

    assert catalog["pickleball"] == "Pickleball"
    assert catalog["table_tennis"] == "Table Tennis"
    assert catalog["disc_golf"] == "Disc Golf"


def test_list_sports_preserves_custom_entries(sports_client):
    client, session_maker = sports_client

    async def seed_custom_sport() -> None:
        async with session_maker() as session:
            session.add(Sport(id="custom", name="Custom Sport"))
            await session.commit()

    asyncio.run(seed_custom_sport())

    response = client.get("/api/v0/sports")
    assert response.status_code == 200
    payload = response.json()
    catalog = {entry["id"]: entry["name"] for entry in payload}

    assert catalog["custom"] == "Custom Sport"
