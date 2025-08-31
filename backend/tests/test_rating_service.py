import asyncio

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy import select

from backend.app.models import Player, Rating
from backend.app.services import update_ratings


def test_update_ratings():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async_session_maker = sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    async def run_test():
        async with engine.begin() as conn:
            await conn.run_sync(Player.__table__.create)
            await conn.run_sync(Rating.__table__.create)

        async with async_session_maker() as session:
            session.add_all([
                Player(id="p1", name="A"),
                Player(id="p2", name="B"),
                Rating(id="r1", player_id="p1", sport_id="padel", value=1000),
                Rating(id="r2", player_id="p2", sport_id="padel", value=1000),
            ])
            await session.commit()
            await update_ratings(session, "padel", ["p1"], ["p2"])
            await session.commit()
            rows = (
                await session.execute(select(Rating).order_by(Rating.player_id))
            ).scalars().all()
            return [r.value for r in rows]

    r1, r2 = asyncio.run(run_test())
    assert r1 > 1000
    assert r2 < 1000
