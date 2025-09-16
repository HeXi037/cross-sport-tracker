import os
import sys
import uuid
import asyncio

from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import db
from app.models import Player, PlayerMetric
from app.routers import players
from app.services.metrics import update_player_metrics

app = FastAPI()
app.include_router(players.router)


async def _drop_player_metric_table() -> None:
    engine = db.get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(
            lambda sync_conn: PlayerMetric.__table__.drop(
                sync_conn, checkfirst=True
            )
        )


async def _create_player_metric_table() -> None:
    engine = db.get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(
            lambda sync_conn: PlayerMetric.__table__.create(
                sync_conn, checkfirst=True
            )
        )


def test_update_player_metrics_handles_missing_table() -> None:
    asyncio.run(_drop_player_metric_table())
    try:
        new_player_id = uuid.uuid4().hex
        new_player_name = f"player-{new_player_id}"

        async def run_update() -> None:
            async with db.AsyncSessionLocal() as session:
                session.add(Player(id=new_player_id, name=new_player_name))
                await update_player_metrics(
                    session,
                    sport_id="padel",
                    winners=["winner"],
                    losers=["loser"],
                )
                await session.commit()

        asyncio.run(run_update())

        async def fetch_player() -> None:
            async with db.AsyncSessionLocal() as session:
                player = await session.get(Player, new_player_id)
                assert player is not None
                assert player.name == new_player_name

        asyncio.run(fetch_player())
    finally:
        asyncio.run(_create_player_metric_table())


def test_get_player_handles_missing_metrics_table() -> None:
    player_id = uuid.uuid4().hex
    player_name = f"player-{player_id}"

    async def insert_player() -> None:
        async with db.AsyncSessionLocal() as session:
            session.add(Player(id=player_id, name=player_name))
            await session.commit()

    asyncio.run(insert_player())
    asyncio.run(_drop_player_metric_table())

    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.get(f"/players/{player_id}")
            assert resp.status_code == 200
            body = resp.json()
            assert body["id"] == player_id
            assert body["name"] == player_name
            assert body["metrics"] is None
            assert body["milestones"] is None
    finally:
        asyncio.run(_create_player_metric_table())
