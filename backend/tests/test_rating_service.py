import asyncio

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy import select

from backend.app.models import Player, Rating, Match, MatchParticipant, ScoreEvent
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
            await conn.run_sync(Match.__table__.create)
            await conn.run_sync(MatchParticipant.__table__.create)

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


def test_update_ratings_draw():
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
            await conn.run_sync(Match.__table__.create)
            await conn.run_sync(MatchParticipant.__table__.create)

        async with async_session_maker() as session:
            session.add_all([
                Player(id="p1", name="A"),
                Player(id="p2", name="B"),
                Rating(id="r1", player_id="p1", sport_id="padel", value=1200),
                Rating(id="r2", player_id="p2", sport_id="padel", value=1000),
            ])
            await session.commit()

            await update_ratings(
                session,
                "padel",
                ["p1"],
                ["p2"],
                draws=["p1", "p2"],
            )
            await session.commit()
            rows = (
                await session.execute(select(Rating).order_by(Rating.player_id))
            ).scalars().all()
            return [r.value for r in rows]

    r1, r2 = asyncio.run(run_test())
    assert r1 < 1200  # higher-rated player loses points on draw
    assert r2 > 1000  # lower-rated player gains points on draw


def test_update_ratings_variable_k():
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
            await conn.run_sync(Match.__table__.create)
            await conn.run_sync(MatchParticipant.__table__.create)

        async with async_session_maker() as session:
            # Create players and ratings
            session.add_all([
                Player(id="p1", name="A"),
                Player(id="p2", name="B"),
                Rating(id="r1", player_id="p1", sport_id="padel", value=1000),
                Rating(id="r2", player_id="p2", sport_id="padel", value=1000),
            ])
            await session.commit()

            # Insert 31 past matches for p1 to reduce K
            for i in range(31):
                mid = f"m{i}"
                session.add(
                    Match(id=mid, sport_id="padel", stage_id=None, ruleset_id=None)
                )
                session.add(
                    MatchParticipant(
                        id=f"mp{i}",
                        match_id=mid,
                        side="A",
                        player_ids=["p1"],
                    )
                )
            await session.commit()

            await update_ratings(session, "padel", ["p1"], ["p2"])
            await session.commit()
            rows = (
                await session.execute(select(Rating).order_by(Rating.player_id))
            ).scalars().all()
            return [r.value for r in rows]

    r1, r2 = asyncio.run(run_test())
    # p1 K-factor should be halved; expected change = 8 points
    assert abs(r1 - 1008) < 1e-6
    # p2 still uses default K-factor 32; expected change = -16 points
    assert abs(r2 - 984) < 1e-6


def test_update_ratings_creates_score_events():
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
            await conn.run_sync(Match.__table__.create)
            await conn.run_sync(MatchParticipant.__table__.create)
            await conn.run_sync(ScoreEvent.__table__.create)

        async with async_session_maker() as session:
            session.add_all([
                Player(id="p1", name="A"),
                Player(id="p2", name="B"),
                Rating(id="r1", player_id="p1", sport_id="padel", value=1000),
                Rating(id="r2", player_id="p2", sport_id="padel", value=1000),
                Match(id="m1", sport_id="padel"),
                MatchParticipant(id="mp1", match_id="m1", side="A", player_ids=["p1"]),
                MatchParticipant(id="mp2", match_id="m1", side="B", player_ids=["p2"]),
            ])
            await session.commit()

            await update_ratings(session, "padel", ["p1"], ["p2"], match_id="m1")
            await session.commit()

            events = (await session.execute(select(ScoreEvent))).scalars().all()
            return [e.payload for e in events]

    payloads = asyncio.run(run_test())
    assert {p["playerId"] for p in payloads} == {"p1", "p2"}
