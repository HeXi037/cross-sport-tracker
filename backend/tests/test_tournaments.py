import os
import sys
from pathlib import Path
from types import SimpleNamespace

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


@pytest.mark.anyio
async def test_stage_schedule_rejects_invalid_type(monkeypatch):
    from app import db
    from app.models import (
        Sport,
        Tournament,
        Stage,
        Player,
        RuleSet,
        Match,
        MatchParticipant,
        StageStanding,
        ScoreEvent,
    )
    from app.routers import tournaments, matches
    from app.routers.admin import require_admin
    from app.routers.auth import get_current_user

    db.engine = None
    db.AsyncSessionLocal = None
    engine = db.get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(
            db.Base.metadata.create_all,
            tables=[
                Sport.__table__,
                Tournament.__table__,
                Stage.__table__,
                Player.__table__,
                RuleSet.__table__,
                Match.__table__,
                MatchParticipant.__table__,
                StageStanding.__table__,
                ScoreEvent.__table__,
            ],
        )

    async with db.AsyncSessionLocal() as session:
        session.add(Sport(id="padel", name="Padel"))
        session.add(RuleSet(id="padel-default", sport_id="padel", name="Padel", config={}))
        for idx in range(4):
            session.add(Player(id=f"p{idx+1}", name=f"Player {idx+1}"))
        await session.commit()

    app = FastAPI()
    app.include_router(tournaments.router)
    app.include_router(matches.router)

    admin_user = SimpleNamespace(id="admin", is_admin=True)

    async def _admin_dep():
        return admin_user

    app.dependency_overrides[require_admin] = _admin_dep
    app.dependency_overrides[get_current_user] = _admin_dep

    async def _noop_update_ratings(*args, **kwargs):
        return None

    async def _noop_update_metrics(*args, **kwargs):
        return None

    async def _noop_broadcast(*args, **kwargs):
        return None

    monkeypatch.setattr("app.routers.matches.update_ratings", _noop_update_ratings)
    monkeypatch.setattr(
        "app.routers.matches.update_player_metrics", _noop_update_metrics
    )
    monkeypatch.setattr("app.routers.matches.broadcast", _noop_broadcast)

    with TestClient(app) as client:
        tid = client.post(
            "/tournaments", json={"sport": "padel", "name": "Winter Cup"}
        ).json()["id"]

        stage_resp = client.post(
            f"/tournaments/{tid}/stages", json={"type": "round_robin"}
        )
        assert stage_resp.status_code == 200
        sid = stage_resp.json()["id"]

        resp = client.post(
            f"/tournaments/{tid}/stages/{sid}/schedule",
            json={"playerIds": ["p1", "p2", "p3", "p4"], "rulesetId": "padel-default"},
        )
        assert resp.status_code == 400
        payload = resp.json()
        assert payload["detail"] == "stage type does not support automatic scheduling"


@pytest.mark.anyio
async def test_stage_schedule_and_standings_flow(monkeypatch):
    from app import db
    from app.models import (
        Sport,
        Tournament,
        Stage,
        Player,
        RuleSet,
        Match,
        MatchParticipant,
        StageStanding,
        ScoreEvent,
    )
    from app.routers import tournaments, matches
    from app.routers.admin import require_admin
    from app.routers.auth import get_current_user

    db.engine = None
    db.AsyncSessionLocal = None
    engine = db.get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(
            db.Base.metadata.create_all,
            tables=[
                Sport.__table__,
                Tournament.__table__,
                Stage.__table__,
                Player.__table__,
                RuleSet.__table__,
                Match.__table__,
                MatchParticipant.__table__,
                StageStanding.__table__,
                ScoreEvent.__table__,
            ],
        )

    async with db.AsyncSessionLocal() as session:
        session.add(Sport(id="padel", name="Padel"))
        session.add(
            RuleSet(id="padel-default", sport_id="padel", name="Padel", config={})
        )
        for idx in range(4):
            session.add(Player(id=f"p{idx+1}", name=f"Player {idx+1}"))
        await session.commit()

    app = FastAPI()
    app.include_router(tournaments.router)
    app.include_router(matches.router)

    admin_user = SimpleNamespace(id="admin", is_admin=True)

    async def _admin_dep():
        return admin_user

    app.dependency_overrides[require_admin] = _admin_dep
    app.dependency_overrides[get_current_user] = _admin_dep

    async def _noop_update_ratings(*args, **kwargs):
        return None

    async def _noop_update_metrics(*args, **kwargs):
        return None

    async def _noop_broadcast(*args, **kwargs):
        return None

    monkeypatch.setattr("app.routers.matches.update_ratings", _noop_update_ratings)
    monkeypatch.setattr(
        "app.routers.matches.update_player_metrics", _noop_update_metrics
    )
    monkeypatch.setattr("app.routers.matches.broadcast", _noop_broadcast)

    with TestClient(app) as client:
        tid = client.post(
            "/tournaments", json={"sport": "padel", "name": "Americano"}
        ).json()["id"]
        sid = client.post(
            f"/tournaments/{tid}/stages",
            json={"type": "americano", "config": {"format": "americano"}},
        ).json()["id"]

        schedule_resp = client.post(
            f"/tournaments/{tid}/stages/{sid}/schedule",
            json={"playerIds": ["p1", "p2", "p3", "p4"], "rulesetId": "padel-default"},
        )
        assert schedule_resp.status_code == 200
        schedule_payload = schedule_resp.json()
        assert schedule_payload["stageId"] == sid
        assert len(schedule_payload["matches"]) == 1

        match_info = schedule_payload["matches"][0]
        assert match_info["stageId"] == sid
        assert match_info["rulesetId"] == "padel-default"
        participants = {p["side"]: p["playerIds"] for p in match_info["participants"]}
        assert participants["A"] == ["p1", "p2"]
        assert participants["B"] == ["p3", "p4"]

        standings_resp = client.get(
            f"/tournaments/{tid}/stages/{sid}/standings"
        )
        assert standings_resp.status_code == 200
        standings_payload = standings_resp.json()
        assert standings_payload["stageId"] == sid
        assert len(standings_payload["standings"]) == 4
        assert all(entry["matchesPlayed"] == 0 for entry in standings_payload["standings"])

        match_id = match_info["id"]
        result_resp = client.post(
            f"/matches/{match_id}/sets",
            json={"sets": [{"A": 6, "B": 4}, {"A": 6, "B": 3}]},
        )
        assert result_resp.status_code == 200

        updated = client.get(f"/tournaments/{tid}/stages/{sid}/standings").json()
        stats = {row["playerId"]: row for row in updated["standings"]}
        assert stats["p1"]["wins"] == 1
        assert stats["p2"]["wins"] == 1
        assert stats["p3"]["losses"] == 1
        assert stats["p4"]["losses"] == 1
        assert stats["p1"]["matchesPlayed"] == 1
        assert stats["p3"]["pointsScored"] == 7
        assert stats["p1"]["pointsScored"] == 12
        assert stats["p1"]["pointsDiff"] == 5
        assert stats["p3"]["pointsDiff"] == -5
        assert stats["p1"]["points"] == 3
        assert stats["p3"]["points"] == 0
