import asyncio

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.models import Player, PlayerMetric, Sport
from backend.app.services.metrics import update_player_metrics


def test_update_player_metrics_draws():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async_session_maker = sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    async def run_test():
        async with engine.begin() as conn:
            await conn.run_sync(create_table, Sport.__table__)
            await conn.run_sync(create_table, Player.__table__)
            await conn.run_sync(create_table, PlayerMetric.__table__)

        async with async_session_maker() as session:
            session.add(Sport(id="padel", name="Padel"))
            session.add_all([Player(id="p1", name="A"), Player(id="p2", name="B")])
            await session.commit()

            await update_player_metrics(session, "padel", [], [], ["p1", "p2"])
            await session.commit()

            rows = (
                await session.execute(select(PlayerMetric).order_by(PlayerMetric.player_id))
            ).scalars().all()
            return rows

    try:
        rows = asyncio.run(run_test())
    finally:
        asyncio.run(engine.dispose())

    assert len(rows) == 2
    assert rows[0].metrics["matches"] == 1
    assert rows[0].metrics["draws"] == 1
    assert rows[1].metrics["matches"] == 1
    assert rows[1].metrics["draws"] == 1
