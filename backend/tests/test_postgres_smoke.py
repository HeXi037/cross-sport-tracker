import asyncio
import os
import sys

import pytest
from sqlalchemy import select

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from backend.app import db
from backend.app.models import Sport, Team


def _get_sessionmaker():
    if db.AsyncSessionLocal is None:
        db.get_engine()
    return db.AsyncSessionLocal


@pytest.mark.postgres
def test_postgres_insert_and_query():
    async def run():
        sessionmaker = _get_sessionmaker()
        async with sessionmaker() as session:
            session.add(Sport(id="padel", name="Padel"))
            await session.commit()
            result = await session.execute(select(Sport).where(Sport.id == "padel"))
            sport = result.scalar_one()
            assert sport.name == "Padel"

    asyncio.run(run())


@pytest.mark.postgres
def test_postgres_json_roundtrip():
    async def run():
        sessionmaker = _get_sessionmaker()
        async with sessionmaker() as session:
            session.add(Team(id="team-1", player_ids=["p1", "p2"]))
            await session.commit()
            result = await session.execute(select(Team).where(Team.id == "team-1"))
            team = result.scalar_one()
            assert team.player_ids == ["p1", "p2"]

    asyncio.run(run())
