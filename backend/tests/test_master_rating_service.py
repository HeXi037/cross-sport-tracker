import asyncio
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy import select

from backend.app.models import Player, Rating, MasterRating
from backend.app.services import update_master_ratings


def test_update_master_ratings_upsert_and_prune():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async_session_maker = sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    async def run_test():
        async with engine.begin() as conn:
            await conn.run_sync(create_table, Player.__table__)
            await conn.run_sync(create_table, Rating.__table__)
            await conn.run_sync(create_table, MasterRating.__table__)

        async with async_session_maker() as session:
            session.add_all([
                Player(id="p1", name="A"),
                Player(id="p2", name="B"),
                Player(id="p3", name="C", deleted_at=datetime.now(timezone.utc)),
                Rating(id="r1", player_id="p1", sport_id="padel", value=1200),
                Rating(id="r2", player_id="p2", sport_id="padel", value=800),
                Rating(id="r3", player_id="p3", sport_id="padel", value=1000),
                MasterRating(id="m1", player_id="p1", value=500),
                MasterRating(id="m3", player_id="p3", value=750),
            ])
            await session.commit()
            await update_master_ratings(session)

        async with async_session_maker() as session:
            rows = (
                await session.execute(
                    select(MasterRating).order_by(MasterRating.player_id)
                )
            ).scalars().all()
            return [(r.player_id, r.value) for r in rows]

    try:
        results = asyncio.run(run_test())
    finally:
        asyncio.run(engine.dispose())
    assert len(results) == 2
    assert results[0][0] == "p1" and abs(results[0][1] - 1000.0) < 1e-6
    assert results[1][0] == "p2" and abs(results[1][1]) < 1e-6
    assert all(pid != "p3" for pid, _ in results)
