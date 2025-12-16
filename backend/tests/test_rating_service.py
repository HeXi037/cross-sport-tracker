import asyncio

import pytest

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy import select

from backend.app.models import (
    Player,
    Rating,
    GlickoRating,
    Match,
    MatchParticipant,
    ScoreEvent,
)
from backend.app.services import update_ratings


@pytest.fixture(scope="module")
def anyio_backend():
    return "asyncio"


def test_update_ratings():
    async def run_test():
        engine = create_async_engine(
            "sqlite+aiosqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        async_session_maker = sessionmaker(
            engine, expire_on_commit=False, class_=AsyncSession
        )

        try:
            async with engine.begin() as conn:
                await conn.run_sync(create_table, Player.__table__)
                await conn.run_sync(create_table, Rating.__table__)
                await conn.run_sync(create_table, GlickoRating.__table__)
                await conn.run_sync(create_table, Match.__table__)
                await conn.run_sync(create_table, MatchParticipant.__table__)

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
                g_rows = (
                    await session.execute(
                        select(GlickoRating).order_by(GlickoRating.player_id)
                    )
                ).scalars().all()
                return [r.value for r in rows], [(gr.rating, gr.rd) for gr in g_rows]
        finally:
            await engine.dispose()

    (r1, r2), glicko_vals = asyncio.run(run_test())
    assert r1 > 1000
    assert r2 < 1000
    assert glicko_vals[0][0] > 1500
    assert glicko_vals[1][0] < 1500


def test_update_ratings_draw():
    async def run_test():
        engine = create_async_engine(
            "sqlite+aiosqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        async_session_maker = sessionmaker(
            engine, expire_on_commit=False, class_=AsyncSession
        )

        try:
            async with engine.begin() as conn:
                await conn.run_sync(create_table, Player.__table__)
                await conn.run_sync(create_table, Rating.__table__)
                await conn.run_sync(create_table, GlickoRating.__table__)
                await conn.run_sync(create_table, Match.__table__)
                await conn.run_sync(create_table, MatchParticipant.__table__)

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
                g_rows = (
                    await session.execute(
                        select(GlickoRating).order_by(GlickoRating.player_id)
                    )
                ).scalars().all()
                return [r.value for r in rows], [(gr.rating, gr.rd) for gr in g_rows]
        finally:
            await engine.dispose()

    (r1, r2), glicko_vals = asyncio.run(run_test())
    assert r1 < 1200  # higher-rated player loses points on draw
    assert r2 > 1000  # lower-rated player gains points on draw
    assert len(glicko_vals) == 2


@pytest.mark.anyio("asyncio")
async def test_update_ratings_draw_only_creates_entries_and_events():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async_session_maker = sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    try:
        async with engine.begin() as conn:
            await conn.run_sync(create_table, Player.__table__)
            await conn.run_sync(create_table, Rating.__table__)
            await conn.run_sync(create_table, GlickoRating.__table__)
            await conn.run_sync(create_table, Match.__table__)
            await conn.run_sync(create_table, MatchParticipant.__table__)
            await conn.run_sync(create_table, ScoreEvent.__table__)

        async with async_session_maker() as session:
            session.add_all(
                [
                    Player(id="p1", name="A"),
                    Player(id="p2", name="B"),
                    Match(id="m_draw", sport_id="padel"),
                    MatchParticipant(
                        id="mp_draw_1", match_id="m_draw", side="A", player_ids=["p1"]
                    ),
                    MatchParticipant(
                        id="mp_draw_2", match_id="m_draw", side="B", player_ids=["p2"]
                    ),
                ]
            )
            await session.commit()

            await update_ratings(
                session,
                "padel",
                [],
                [],
                draws=["p1", "p2"],
                match_id="m_draw",
            )
            await session.commit()

            ratings = (
                await session.execute(select(Rating).order_by(Rating.player_id))
            ).scalars().all()
            glicko_rows = (
                await session.execute(
                    select(GlickoRating).order_by(GlickoRating.player_id)
                )
            ).scalars().all()
            events = (await session.execute(select(ScoreEvent))).scalars().all()
    finally:
        await engine.dispose()

    assert {r.player_id for r in ratings} == {"p1", "p2"}
    assert all(r.value == 1000 for r in ratings)
    assert {g.player_id for g in glicko_rows} == {"p1", "p2"}
    assert len(events) == 2
    payloads = {event.payload["playerId"]: event.payload for event in events}
    assert payloads.keys() == {"p1", "p2"}
    for payload in payloads.values():
        assert payload["systems"]["elo"]["rating"] == payload["rating"]
        assert "glicko" in payload["systems"]
        assert "rating" in payload["systems"]["glicko"]
        assert "rd" in payload["systems"]["glicko"]


def test_update_ratings_variable_k():
    async def run_test():
        engine = create_async_engine(
            "sqlite+aiosqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        async_session_maker = sessionmaker(
            engine, expire_on_commit=False, class_=AsyncSession
        )

        try:
            async with engine.begin() as conn:
                await conn.run_sync(create_table, Player.__table__)
                await conn.run_sync(create_table, Rating.__table__)
                await conn.run_sync(create_table, GlickoRating.__table__)
                await conn.run_sync(create_table, Match.__table__)
                await conn.run_sync(create_table, MatchParticipant.__table__)

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
                g_rows = (
                    await session.execute(
                        select(GlickoRating).order_by(GlickoRating.player_id)
                    )
                ).scalars().all()
                return [r.value for r in rows], [(gr.rating, gr.rd) for gr in g_rows]
        finally:
            await engine.dispose()

    (r1, r2), glicko_vals = asyncio.run(run_test())
    # p1 K-factor should be halved; expected change = 8 points
    assert abs(r1 - 1008) < 1e-6
    # p2 still uses default K-factor 32; expected change = -16 points
    assert abs(r2 - 984) < 1e-6
    assert len(glicko_vals) == 2


def test_update_ratings_creates_score_events():
    async def run_test():
        engine = create_async_engine(
            "sqlite+aiosqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        async_session_maker = sessionmaker(
            engine, expire_on_commit=False, class_=AsyncSession
        )

        try:
            async with engine.begin() as conn:
                await conn.run_sync(create_table, Player.__table__)
                await conn.run_sync(create_table, Rating.__table__)
                await conn.run_sync(create_table, GlickoRating.__table__)
                await conn.run_sync(create_table, Match.__table__)
                await conn.run_sync(create_table, MatchParticipant.__table__)
                await conn.run_sync(create_table, ScoreEvent.__table__)

            async with async_session_maker() as session:
                session.add_all([
                    Player(id="p1", name="A"),
                    Player(id="p2", name="B"),
                    Rating(id="r1", player_id="p1", sport_id="padel", value=1000),
                    Rating(id="r2", player_id="p2", sport_id="padel", value=1000),
                    Match(id="m1", sport_id="padel"),
                    MatchParticipant(
                        id="mp1", match_id="m1", side="A", player_ids=["p1"]
                    ),
                    MatchParticipant(
                        id="mp2", match_id="m1", side="B", player_ids=["p2"]
                    ),
                ])
                await session.commit()

                await update_ratings(session, "padel", ["p1"], ["p2"], match_id="m1")
                await session.commit()

                events = (await session.execute(select(ScoreEvent))).scalars().all()
                return [e.payload for e in events]
        finally:
            await engine.dispose()

    payloads = asyncio.run(run_test())
    assert {p["playerId"] for p in payloads} == {"p1", "p2"}
    for payload in payloads:
        assert "systems" in payload
        systems = payload["systems"]
        assert systems.get("elo", {}).get("rating") == payload["rating"]
        assert "glicko" in systems
        assert "rating" in systems["glicko"]
