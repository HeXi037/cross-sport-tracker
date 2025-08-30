import os
import os
import sys
from pathlib import Path
import asyncio
import pytest
from fastapi import HTTPException

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


@pytest.mark.skip(reason="SQLite lacks ARRAY support for MatchParticipant")
def test_list_matches_filters_by_player(tmp_path):
    os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{tmp_path}/test.db"
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app import db
    from app.models import Player, Match, MatchParticipant, Sport
    from app.routers import matches, players

    db.engine = None
    db.AsyncSessionLocal = None
    engine = db.get_engine()

    async def init_models():
        async with engine.begin() as conn:
            await conn.run_sync(
                db.Base.metadata.create_all,
                tables=[Sport.__table__, Player.__table__, Match.__table__, MatchParticipant.__table__],
            )

    asyncio.run(init_models())

    async def seed_sport():
        async with db.AsyncSessionLocal() as session:
            session.add(Sport(id="padel", name="Padel"))
            await session.commit()

    asyncio.run(seed_sport())

    app = FastAPI()
    app.include_router(players.router)
    app.include_router(matches.router)

    with TestClient(app) as client:
        p1 = client.post("/players", json={"name": "Alice"}).json()["id"]
        p2 = client.post("/players", json={"name": "Bob"}).json()["id"]
        p3 = client.post("/players", json={"name": "Charlie"}).json()["id"]

        m1 = client.post(
            "/matches",
            json={
                "sport": "padel",
                "participants": [
                    {"side": "A", "playerIds": [p1]},
                    {"side": "B", "playerIds": [p2]},
                ],
            },
        ).json()["id"]
        client.post(
            "/matches",
            json={
                "sport": "padel",
                "participants": [
                    {"side": "A", "playerIds": [p2]},
                    {"side": "B", "playerIds": [p3]},
                ],
            },
        )

        resp = client.get("/matches", params={"playerId": p1})
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["id"] == m1
