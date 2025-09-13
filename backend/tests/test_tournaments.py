import os
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

# Ensure backend app modules can be imported
sys.path.append(str(Path(__file__).resolve().parents[1]))


@pytest.fixture
def anyio_backend():
    return "asyncio"

@pytest.mark.anyio
async def test_tournament_crud(tmp_path):
    from app import db
    from app.models import Sport, Tournament, Stage
    from app.routers import tournaments

    db.engine = None
    db.AsyncSessionLocal = None
    engine = db.get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(
            db.Base.metadata.create_all,
            tables=[Sport.__table__, Tournament.__table__, Stage.__table__],
        )
    async with db.AsyncSessionLocal() as session:
        session.add(Sport(id="padel", name="Padel"))
        await session.commit()

    app = FastAPI()
    app.include_router(tournaments.router)

    with TestClient(app) as client:
        resp = client.post("/tournaments", json={"sport": "padel", "name": "Winter Cup"})
        assert resp.status_code == 200
        tid = resp.json()["id"]

        resp = client.get("/tournaments")
        assert resp.status_code == 200
        assert any(t["id"] == tid for t in resp.json())

        resp = client.get(f"/tournaments/{tid}")
        assert resp.status_code == 200
        assert resp.json()["name"] == "Winter Cup"


@pytest.mark.anyio
async def test_stage_crud(tmp_path):
    from app import db
    from app.models import Sport, Tournament, Stage
    from app.routers import tournaments

    db.engine = None
    db.AsyncSessionLocal = None
    engine = db.get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(
            db.Base.metadata.create_all,
            tables=[Sport.__table__, Tournament.__table__, Stage.__table__],
        )
    async with db.AsyncSessionLocal() as session:
        session.add(Sport(id="padel", name="Padel"))
        await session.commit()

    app = FastAPI()
    app.include_router(tournaments.router)

    with TestClient(app) as client:
        tid = client.post("/tournaments", json={"sport": "padel", "name": "Winter Cup"}).json()["id"]

        resp = client.post(f"/tournaments/{tid}/stages", json={"type": "round_robin"})
        assert resp.status_code == 200
        sid = resp.json()["id"]

        resp = client.get(f"/tournaments/{tid}/stages")
        assert resp.status_code == 200
        assert any(s["id"] == sid for s in resp.json())

        resp = client.get(f"/tournaments/{tid}/stages/{sid}")
        assert resp.status_code == 200
        assert resp.json()["type"] == "round_robin"
