import os
import sys
import uuid
from collections import Counter
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from slowapi.errors import RateLimitExceeded

from app.routers import auth

from app.schemas import ParticipantOut

# Ensure backend app modules can be imported
sys.path.append(str(Path(__file__).resolve().parents[1]))


@pytest.fixture
def anyio_backend():
    return "asyncio"

def _configured_app() -> FastAPI:
    app = FastAPI()
    app.state.limiter = auth.limiter
    app.add_exception_handler(RateLimitExceeded, auth.rate_limit_handler)
    return app


@pytest.mark.anyio
async def test_tournament_crud(tmp_path):
    from app import db
    from app.models import Sport, Tournament, Stage, StageStanding, User
    from app.routers import tournaments
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
                StageStanding.__table__,
                User.__table__,
            ],
        )
    async with db.AsyncSessionLocal() as session:
        session.add(Sport(id="padel", name="Padel"))
        session.add(
            User(
                id="admin",
                username="admin",
                password_hash="hashed",
                is_admin=True,
            )
        )
        await session.commit()

    app = _configured_app()
    app.include_router(tournaments.router)
    admin_user = SimpleNamespace(id="admin", is_admin=True)

    async def _admin_dep():
        return admin_user

    app.dependency_overrides[get_current_user] = _admin_dep

    with TestClient(app) as client:
        resp = client.post("/tournaments", json={"sport": "padel", "name": "Winter Cup"})
        assert resp.status_code == 200
        tid = resp.json()["id"]
        assert resp.json()["createdByUserId"] == "admin"

        resp = client.get("/tournaments")
        assert resp.status_code == 200
        tournaments_payload = resp.json()
        assert any(t["id"] == tid for t in tournaments_payload)
        assert all(t["createdByUserId"] == "admin" for t in tournaments_payload)

        resp = client.get(f"/tournaments/{tid}")
        assert resp.status_code == 200
        assert resp.json()["name"] == "Winter Cup"
        assert resp.json()["createdByUserId"] == "admin"

        resp = client.patch(f"/tournaments/{tid}", json={"name": "Winter Cup Finals"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "Winter Cup Finals"

        resp = client.get(f"/tournaments/{tid}")
        assert resp.status_code == 200
        assert resp.json()["name"] == "Winter Cup Finals"


@pytest.mark.anyio
async def test_stage_crud(tmp_path):
    from app import db
    from app.models import Sport, Tournament, Stage, StageStanding, User
    from app.routers import tournaments
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
                StageStanding.__table__,
                User.__table__,
            ],
        )
    async with db.AsyncSessionLocal() as session:
        session.add(Sport(id="padel", name="Padel"))
        session.add(
            User(
                id="admin",
                username="admin",
                password_hash="hashed",
                is_admin=True,
            )
        )
        await session.commit()

    app = _configured_app()
    app.include_router(tournaments.router)
    admin_user = SimpleNamespace(id="admin", is_admin=True)

    async def _admin_dep():
        return admin_user

    app.dependency_overrides[get_current_user] = _admin_dep

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
async def test_normal_user_can_create_americano_stage():
    from app import db
    from app.models import Sport, Tournament, Stage, StageStanding, User
    from app.routers import tournaments
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
                StageStanding.__table__,
                User.__table__,
            ],
        )

    async with db.AsyncSessionLocal() as session:
        session.add(Sport(id="padel", name="Padel"))
        session.add(
            User(
                id="player1",
                username="player1",
                password_hash="hashed",
                is_admin=False,
            )
        )
        await session.commit()

    app = _configured_app()
    app.include_router(tournaments.router)

    owner = SimpleNamespace(id="player1", is_admin=False)

    async def _owner_dep():
        return owner

    app.dependency_overrides[get_current_user] = _owner_dep

    with TestClient(app) as client:
        tid = client.post("/tournaments", json={"sport": "padel", "name": "Club Night"}).json()["id"]
        resp = client.post(f"/tournaments/{tid}/stages", json={"type": "americano"})
        assert resp.status_code == 200
        stage_payload = resp.json()
        assert stage_payload["tournamentId"] == tid
        assert stage_payload["type"] == "americano"


@pytest.mark.anyio
async def test_normal_user_can_create_round_robin_stage_for_other_sport():
    from app import db
    from app.models import Sport, Tournament, Stage, StageStanding, User
    from app.routers import tournaments
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
                StageStanding.__table__,
                User.__table__,
            ],
        )

    async with db.AsyncSessionLocal() as session:
        session.add(Sport(id="tennis", name="Tennis"))
        session.add(
            User(
                id="player1",
                username="player1",
                password_hash="hashed",
                is_admin=False,
            )
        )
        await session.commit()

    app = _configured_app()
    app.include_router(tournaments.router)

    owner = SimpleNamespace(id="player1", is_admin=False)

    async def _owner_dep():
        return owner

    app.dependency_overrides[get_current_user] = _owner_dep

    with TestClient(app) as client:
        tid = client.post("/tournaments", json={"sport": "tennis", "name": "Club Night"}).json()["id"]
        resp = client.post(f"/tournaments/{tid}/stages", json={"type": "round_robin"})
        assert resp.status_code == 200
        assert resp.json()["type"] == "round_robin"


@pytest.mark.anyio
async def test_normal_user_cannot_create_stage_for_other_user():
    from app import db
    from app.models import Sport, Tournament, Stage, StageStanding, User
    from app.routers import tournaments
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
                StageStanding.__table__,
                User.__table__,
            ],
        )

    async with db.AsyncSessionLocal() as session:
        session.add(Sport(id="padel", name="Padel"))
        session.add(
            User(
                id="owner",
                username="owner",
                password_hash="hashed",
                is_admin=False,
            )
        )
        session.add(
            User(
                id="other",
                username="other",
                password_hash="hashed",
                is_admin=False,
            )
        )
        await session.commit()

    app = _configured_app()
    app.include_router(tournaments.router)

    owner = SimpleNamespace(id="owner", is_admin=False)

    async def _owner_dep():
        return owner

    app.dependency_overrides[get_current_user] = _owner_dep

    with TestClient(app) as client:
        tid = client.post("/tournaments", json={"sport": "padel", "name": "Club Night"}).json()["id"]

    other_user = SimpleNamespace(id="other", is_admin=False)

    async def _other_dep():
        return other_user

    app.dependency_overrides[get_current_user] = _other_dep

    with TestClient(app) as client:
        resp = client.post(f"/tournaments/{tid}/stages", json={"type": "americano"})
        assert resp.status_code == 403


@pytest.mark.anyio
async def test_normal_user_can_delete_own_americano():
    from app import db
    from sqlalchemy import select
    from app.models import (
        Match,
        MatchAuditLog,
        MatchParticipant,
        ScoreEvent,
        Sport,
        Stage,
        Tournament,
        StageStanding,
        User,
    )
    from app.routers import tournaments
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
                StageStanding.__table__,
                Match.__table__,
                MatchAuditLog.__table__,
                MatchParticipant.__table__,
                ScoreEvent.__table__,
                User.__table__,
            ],
        )

    async with db.AsyncSessionLocal() as session:
        session.add(Sport(id="tennis", name="Tennis"))
        session.add(
            User(
                id="player1",
                username="player1",
                password_hash="hashed",
                is_admin=False,
            )
        )
        await session.commit()

    app = _configured_app()
    app.include_router(tournaments.router)
    owner = SimpleNamespace(id="player1", is_admin=False)

    async def _owner_dep():
        return owner

    app.dependency_overrides[get_current_user] = _owner_dep

    with TestClient(app) as client:
        tid = client.post(
            "/tournaments", json={"sport": "tennis", "name": "Local Ladder"}
        ).json()["id"]
        sid = client.post(
            f"/tournaments/{tid}/stages", json={"type": "round_robin"}
        ).json()["id"]

    async with db.AsyncSessionLocal() as session:
        match = Match(
            id="m1",
            sport_id="padel",
            stage_id=sid,
            ruleset_id=None,
            best_of=None,
            played_at=None,
            location=None,
            details=None,
            is_friendly=False,
        )
        session.add(match)
        session.add(
            MatchParticipant(
                id="mp1", match_id="m1", side="A", player_ids=["p1"]
            )
        )
        session.add(
            MatchParticipant(
                id="mp2", match_id="m1", side="B", player_ids=["p3"]
            )
        )
        session.add(
            ScoreEvent(
                id="se1",
                match_id="m1",
                type="POINT",
                payload={"A": 6, "B": 2},
            )
        )
        await session.commit()

    with TestClient(app) as client:
        resp = client.delete(f"/tournaments/{tid}")
        assert resp.status_code == 204

    async with db.AsyncSessionLocal() as session:
        assert await session.get(Tournament, tid) is None
        assert await session.get(Stage, sid) is None
        assert await session.get(Match, "m1") is None
        participants = (
            await session.execute(
                select(MatchParticipant).where(MatchParticipant.match_id == "m1")
            )
        ).scalars().all()
        assert participants == []
        score_events = (
            await session.execute(
                select(ScoreEvent).where(ScoreEvent.match_id == "m1")
            )
        ).scalars().all()
        assert score_events == []


@pytest.mark.anyio
async def test_normal_user_cannot_delete_other_users_tournament():
    from app import db
    from app.models import (
        Match,
        MatchAuditLog,
        MatchParticipant,
        ScoreEvent,
        Sport,
        Stage,
        StageStanding,
        Tournament,
        User,
    )
    from app.routers import tournaments
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
                StageStanding.__table__,
                Match.__table__,
                MatchAuditLog.__table__,
                MatchParticipant.__table__,
                ScoreEvent.__table__,
                User.__table__,
            ],
        )

    async with db.AsyncSessionLocal() as session:
        session.add(Sport(id="padel", name="Padel"))
        session.add(
            User(
                id="owner",
                username="owner",
                password_hash="hashed",
                is_admin=False,
            )
        )
        session.add(
            User(
                id="other",
                username="other",
                password_hash="hashed",
                is_admin=False,
            )
        )
        await session.commit()

    app = _configured_app()
    app.include_router(tournaments.router)

    owner = SimpleNamespace(id="owner", is_admin=False)

    async def _owner_dep():
        return owner

    app.dependency_overrides[get_current_user] = _owner_dep

    with TestClient(app) as client:
        tid = client.post(
            "/tournaments", json={"sport": "padel", "name": "Club Americano"}
        ).json()["id"]
        client.post(
            f"/tournaments/{tid}/stages", json={"type": "americano"}
        )

    other_user = SimpleNamespace(id="other", is_admin=False)

    async def _other_dep():
        return other_user

    app.dependency_overrides[get_current_user] = _other_dep

    with TestClient(app) as client:
        resp = client.delete(f"/tournaments/{tid}")
        assert resp.status_code == 403


@pytest.mark.anyio
async def test_normal_user_can_update_own_tournament():
    from app import db
    from app.models import Sport, Tournament, User
    from app.routers import tournaments
    from app.routers.auth import get_current_user

    db.engine = None
    db.AsyncSessionLocal = None
    engine = db.get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(
            db.Base.metadata.create_all,
            tables=[Sport.__table__, Tournament.__table__, User.__table__],
        )

    async with db.AsyncSessionLocal() as session:
        session.add(Sport(id="tennis", name="Tennis"))
        session.add(
            User(
                id="owner",
                username="owner",
                password_hash="hashed",
                is_admin=False,
            )
        )
        await session.commit()

    app = _configured_app()
    app.include_router(tournaments.router)

    owner = SimpleNamespace(id="owner", is_admin=False)

    async def _owner_dep():
        return owner

    app.dependency_overrides[get_current_user] = _owner_dep

    with TestClient(app) as client:
        tid = client.post(
            "/tournaments", json={"sport": "tennis", "name": "Club Ladder"}
        ).json()["id"]

        resp = client.patch(
            f"/tournaments/{tid}", json={"name": "Club Ladder Finals"}
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Club Ladder Finals"


@pytest.mark.anyio
async def test_normal_user_cannot_update_other_users_tournament():
    from app import db
    from app.models import Sport, Tournament, User
    from app.routers import tournaments
    from app.routers.auth import get_current_user

    db.engine = None
    db.AsyncSessionLocal = None
    engine = db.get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(
            db.Base.metadata.create_all,
            tables=[Sport.__table__, Tournament.__table__, User.__table__],
        )

    async with db.AsyncSessionLocal() as session:
        session.add(Sport(id="padel", name="Padel"))
        session.add(
            User(
                id="owner",
                username="owner",
                password_hash="hashed",
                is_admin=False,
            )
        )
        session.add(
            User(
                id="other",
                username="other",
                password_hash="hashed",
                is_admin=False,
            )
        )
        await session.commit()

    app = _configured_app()
    app.include_router(tournaments.router)

    owner = SimpleNamespace(id="owner", is_admin=False)

    async def _owner_dep():
        return owner

    app.dependency_overrides[get_current_user] = _owner_dep

    with TestClient(app) as client:
        tid = client.post(
            "/tournaments", json={"sport": "padel", "name": "Club Americano"}
        ).json()["id"]

    other_user = SimpleNamespace(id="other", is_admin=False)

    async def _other_dep():
        return other_user

    app.dependency_overrides[get_current_user] = _other_dep

    with TestClient(app) as client:
        resp = client.patch(
            f"/tournaments/{tid}", json={"name": "Updated Name"}
        )
        assert resp.status_code == 403


@pytest.mark.anyio
async def test_admin_can_delete_user_tournament():
    from app import db
    from app.models import (
        Match,
        MatchAuditLog,
        MatchParticipant,
        ScoreEvent,
        Sport,
        Stage,
        StageStanding,
        Tournament,
        User,
    )
    from app.routers import tournaments
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
                StageStanding.__table__,
                Match.__table__,
                MatchAuditLog.__table__,
                MatchParticipant.__table__,
                ScoreEvent.__table__,
                User.__table__,
            ],
        )

    async with db.AsyncSessionLocal() as session:
        session.add(Sport(id="padel", name="Padel"))
        session.add(
            User(
                id="owner",
                username="owner",
                password_hash="hashed",
                is_admin=False,
            )
        )
        session.add(
            User(
                id="admin",
                username="admin",
                password_hash="hashed",
                is_admin=True,
            )
        )
        await session.commit()

    app = _configured_app()
    app.include_router(tournaments.router)

    owner = SimpleNamespace(id="owner", is_admin=False)

    async def _owner_dep():
        return owner

    app.dependency_overrides[get_current_user] = _owner_dep

    with TestClient(app) as client:
        tid = client.post(
            "/tournaments", json={"sport": "padel", "name": "Open Americano"}
        ).json()["id"]
        client.post(
            f"/tournaments/{tid}/stages", json={"type": "americano"}
        )

    admin_user = SimpleNamespace(id="admin", is_admin=True)

    async def _admin_dep():
        return admin_user

    app.dependency_overrides[get_current_user] = _admin_dep

    with TestClient(app) as client:
        resp = client.delete(f"/tournaments/{tid}")
        assert resp.status_code == 204


@pytest.mark.anyio
async def test_owner_can_schedule_their_americano_stage(monkeypatch):
    from app import db
    from app.models import (
        Match,
        MatchAuditLog,
        MatchParticipant,
        Player,
        RuleSet,
        ScoreEvent,
        Sport,
        Stage,
        StageStanding,
        Tournament,
        User,
    )
    from app.routers import tournaments
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
                MatchAuditLog.__table__,
                MatchParticipant.__table__,
                StageStanding.__table__,
                ScoreEvent.__table__,
                User.__table__,
            ],
        )

    async with db.AsyncSessionLocal() as session:
        session.add(Sport(id="padel", name="Padel"))
        session.add(
            RuleSet(id="padel-default", sport_id="padel", name="Padel", config={})
        )
        session.add(Sport(id="padel_americano", name="Padel Americano"))
        for idx in range(4):
            session.add(Player(id=f"p{idx+1}", name=f"Player {idx+1}"))
        session.add(
            User(
                id="owner",
                username="owner",
                password_hash="hashed",
                is_admin=False,
            )
        )
        await session.commit()

    app = _configured_app()
    app.include_router(tournaments.router)

    owner = SimpleNamespace(id="owner", is_admin=False)

    async def _owner_dep():
        return owner

    app.dependency_overrides[get_current_user] = _owner_dep

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
            "/tournaments", json={"sport": "padel", "name": "Owner Cup"}
        ).json()["id"]
        sid = client.post(
            f"/tournaments/{tid}/stages",
            json={"type": "americano", "config": {"format": "americano"}},
        ).json()["id"]

        resp = client.post(
            f"/tournaments/{tid}/stages/{sid}/schedule",
            json={"playerIds": ["p1", "p2", "p3", "p4"], "rulesetId": "padel-default"},
        )
        assert resp.status_code == 200
        payload = resp.json()
        assert payload["stageId"] == sid
        assert len(payload["matches"]) == 1


@pytest.mark.anyio
async def test_owner_can_schedule_round_robin_stage(monkeypatch):
    from app import db
    from app.models import (
        Match,
        MatchAuditLog,
        MatchParticipant,
        Player,
        RuleSet,
        ScoreEvent,
        Sport,
        Stage,
        StageStanding,
        Tournament,
        User,
    )
    from app.routers import tournaments
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
                MatchAuditLog.__table__,
                MatchParticipant.__table__,
                StageStanding.__table__,
                ScoreEvent.__table__,
                User.__table__,
            ],
        )

    async with db.AsyncSessionLocal() as session:
        session.add(Sport(id="tennis", name="Tennis"))
        session.add(RuleSet(id="tennis-default", sport_id="tennis", name="Tennis", config={}))
        for idx in range(3):
            session.add(Player(id=f"tp{idx+1}", name=f"Tennis Player {idx+1}"))
        session.add(
            User(
                id="organiser",
                username="organiser",
                password_hash="hashed",
                is_admin=False,
            )
        )
        await session.commit()

    app = _configured_app()
    app.include_router(tournaments.router)

    organiser = SimpleNamespace(id="organiser", is_admin=False)

    async def _organiser_dep():
        return organiser

    app.dependency_overrides[get_current_user] = _organiser_dep

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
            "/tournaments", json={"sport": "tennis", "name": "Round Robin Masters"}
        ).json()["id"]
        sid = client.post(
            f"/tournaments/{tid}/stages",
            json={"type": "round_robin"},
        ).json()["id"]

        resp = client.post(
            f"/tournaments/{tid}/stages/{sid}/schedule",
            json={
                "playerIds": ["tp1", "tp2", "tp3"],
                "rulesetId": "tennis-default",
                "bestOf": 3,
            },
        )
        assert resp.status_code == 200
        payload = resp.json()
        assert payload["stageId"] == sid
        assert len(payload["matches"]) == 3
        pairings = {
            frozenset(
                pid for part in match["participants"] for pid in part.get("playerIds", [])
            )
            for match in payload["matches"]
        }
        assert {frozenset({"tp1", "tp2"}), frozenset({"tp1", "tp3"}), frozenset({"tp2", "tp3"})}.issubset(pairings)
        assert all(match["bestOf"] == 3 for match in payload["matches"])

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
        MatchAuditLog,
        MatchParticipant,
        StageStanding,
        ScoreEvent,
        User,
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
                MatchAuditLog.__table__,
                MatchParticipant.__table__,
                StageStanding.__table__,
                ScoreEvent.__table__,
                User.__table__,
            ],
        )

    async with db.AsyncSessionLocal() as session:
        session.add(Sport(id="padel", name="Padel"))
        session.add(RuleSet(id="padel-default", sport_id="padel", name="Padel", config={}))
        for idx in range(4):
            session.add(Player(id=f"p{idx+1}", name=f"Player {idx+1}"))
        session.add(
            User(
                id="admin",
                username="admin",
                password_hash="hashed",
                is_admin=True,
            )
        )
        await session.commit()

    app = _configured_app()
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

        sid = uuid.uuid4().hex
        async with db.AsyncSessionLocal() as session:
            session.add(Stage(id=sid, tournament_id=tid, type="manual", config=None))
            await session.commit()

        resp = client.post(
            f"/tournaments/{tid}/stages/{sid}/schedule",
            json={"playerIds": ["p1", "p2", "p3", "p4"], "rulesetId": "padel-default"},
        )
        assert resp.status_code == 400
        payload = resp.json()
        assert payload["detail"] == "stage type does not support automatic scheduling"


@pytest.mark.anyio
async def test_schedule_single_elim_generates_bracket(monkeypatch):
    from app import db
    from app.models import (
        Sport,
        Tournament,
        Stage,
        Player,
        RuleSet,
        Match,
        MatchAuditLog,
        MatchParticipant,
        StageStanding,
        ScoreEvent,
        User,
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
                MatchAuditLog.__table__,
                MatchParticipant.__table__,
                StageStanding.__table__,
                ScoreEvent.__table__,
                User.__table__,
            ],
        )

    async with db.AsyncSessionLocal() as session:
        session.add(Sport(id="pickleball", name="Pickleball"))
        session.add(RuleSet(id="pickle-default", sport_id="pickleball", name="Pickleball", config={}))
        for idx in range(4):
            session.add(Player(id=f"pb{idx+1}", name=f"Player {idx+1}"))
        session.add(
            User(
                id="admin",
                username="admin",
                password_hash="hashed",
                is_admin=True,
            )
        )
        await session.commit()

    app = _configured_app()
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
            "/tournaments", json={"sport": "pickleball", "name": "Knockout Cup"}
        ).json()["id"]
        sid = client.post(
            f"/tournaments/{tid}/stages",
            json={"type": "single_elim"},
        ).json()["id"]

        resp = client.post(
            f"/tournaments/{tid}/stages/{sid}/schedule",
            json={
                "playerIds": ["pb1", "pb2", "pb3", "pb4"],
                "rulesetId": "pickle-default",
                "bestOf": 5,
            },
        )

        assert resp.status_code == 200
        payload = resp.json()
        assert payload["stageId"] == sid
        assert len(payload["matches"]) == 3  # semifinals + final
        semifinal_pairs = {
            frozenset(pid for part in match["participants"] for pid in part.get("playerIds", []))
            for match in payload["matches"]
            if any(part.get("playerIds") for part in match["participants"])
        }
        assert frozenset({"pb1", "pb2"}) in semifinal_pairs
        assert frozenset({"pb3", "pb4"}) in semifinal_pairs
        assert all(match["bestOf"] == 5 for match in payload["matches"])


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
        MatchAuditLog,
        MatchParticipant,
        StageStanding,
        ScoreEvent,
        User,
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
                MatchAuditLog.__table__,
                MatchParticipant.__table__,
                StageStanding.__table__,
                ScoreEvent.__table__,
                User.__table__,
            ],
        )

    async with db.AsyncSessionLocal() as session:
        session.add(Sport(id="padel", name="Padel"))
        session.add(
            RuleSet(id="padel-default", sport_id="padel", name="Padel", config={})
        )
        for idx in range(4):
            session.add(Player(id=f"p{idx+1}", name=f"Player {idx+1}"))
        session.add(
            User(
                id="admin",
                username="admin",
                password_hash="hashed",
                is_admin=True,
            )
        )
        await session.commit()

    app = _configured_app()
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


@pytest.mark.anyio
async def test_americano_match_events_trigger_rating(monkeypatch):
    from sqlalchemy import select

    from app import db
    from app.models import (
        Sport,
        Tournament,
        Stage,
        Player,
        RuleSet,
        Match,
        MatchAuditLog,
        MatchParticipant,
        StageStanding,
        ScoreEvent,
        Rating,
        PlayerMetric,
        GlickoRating,
        User,
    )
    from app.routers import tournaments, matches, leaderboards
    from app.routers.admin import require_admin
    from app.routers.auth import get_current_user
    from app.scoring import padel as padel_engine

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
                MatchAuditLog.__table__,
                MatchParticipant.__table__,
                StageStanding.__table__,
                ScoreEvent.__table__,
                Rating.__table__,
                PlayerMetric.__table__,
                GlickoRating.__table__,
                User.__table__,
            ],
        )

    async with db.AsyncSessionLocal() as session:
        session.add(Sport(id="padel", name="Padel"))
        session.add(
            RuleSet(id="padel-default", sport_id="padel", name="Padel", config={})
        )
        for idx in range(4):
            session.add(Player(id=f"p{idx+1}", name=f"Player {idx+1}"))
        session.add(
            User(
                id="admin",
                username="admin",
                password_hash="hashed",
                is_admin=True,
            )
        )
        await session.commit()

    app = _configured_app()
    app.include_router(tournaments.router)
    app.include_router(matches.router)
    app.include_router(leaderboards.router)

    admin_user = SimpleNamespace(id="admin", is_admin=True)

    async def _admin_dep():
        return admin_user

    app.dependency_overrides[require_admin] = _admin_dep
    app.dependency_overrides[get_current_user] = _admin_dep

    async def _noop_broadcast(*args, **kwargs):
        return None

    monkeypatch.setattr("app.routers.matches.broadcast", _noop_broadcast)

    with TestClient(app) as client:
        tid = client.post(
            "/tournaments", json={"sport": "padel", "name": "Americano Cup"}
        ).json()["id"]
        sid = client.post(
            f"/tournaments/{tid}/stages",
            json={"type": "americano", "config": {"format": "americano"}},
        ).json()["id"]

        schedule_payload = client.post(
            f"/tournaments/{tid}/stages/{sid}/schedule",
            json={"playerIds": ["p1", "p2", "p3", "p4"], "rulesetId": "padel-default"},
        ).json()
        assert schedule_payload["matches"]
        match_id = schedule_payload["matches"][0]["id"]

        events, _ = padel_engine.record_sets([(6, 4)])
        for ev in events:
            resp = client.post(f"/matches/{match_id}/events", json=ev)
            assert resp.status_code == 200

        standings_payload = client.get(
            f"/tournaments/{tid}/stages/{sid}/standings"
        ).json()
        stats = {row["playerId"]: row for row in standings_payload["standings"]}
        assert stats["p1"]["wins"] == 1
        assert stats["p2"]["wins"] == 1
        assert stats["p3"]["losses"] == 1
        assert stats["p4"]["losses"] == 1
        assert stats["p1"]["matchesPlayed"] == 1

        padel_board = client.get(
            "/leaderboards", params={"sport": "padel"}
        ).json()
        assert padel_board["leaders"] == []

        americano_board = client.get(
            "/leaderboards", params={"sport": "padel_americano"}
        ).json()
        assert {entry["playerId"] for entry in americano_board["leaders"]} >= {
            "p1",
            "p2",
            "p3",
            "p4",
        }
        ratings = {
            entry["playerId"]: entry["rating"] for entry in americano_board["leaders"]
        }
        assert ratings["p1"] > ratings["p3"]

    async with db.AsyncSessionLocal() as session:
        rating_events = (
            await session.execute(
                select(ScoreEvent).where(
                    ScoreEvent.match_id == match_id, ScoreEvent.type == "RATING"
                )
            )
        ).scalars().all()
        assert len(rating_events) == 4


@pytest.mark.anyio
async def test_schedule_americano_balances_odd_roster():
    from sqlalchemy import select

    from app import db
    from app.models import (
        Match,
        MatchAuditLog,
        MatchParticipant,
        Player,
        RuleSet,
        Sport,
        Stage,
        StageStanding,
        Tournament,
    )
    from app.services.tournaments import schedule_americano

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
                MatchAuditLog.__table__,
                MatchParticipant.__table__,
                StageStanding.__table__,
            ],
        )

    async with db.AsyncSessionLocal() as session:
        session.add(Sport(id="padel", name="Padel"))
        session.add(Tournament(id="t1", sport_id="padel", name="Odd Americano"))
        session.add(Stage(id="s1", tournament_id="t1", type="americano", config=None))
        session.add(
            RuleSet(id="padel-default", sport_id="padel", name="Padel", config={})
        )
        for idx in range(15):
            session.add(Player(id=f"p{idx+1}", name=f"Player {idx+1}"))
        await session.commit()

    async with db.AsyncSessionLocal() as session:
        players = [f"p{idx+1}" for idx in range(15)]
        created = await schedule_americano(
            "s1",
            "padel",
            players,
            session,
            ruleset_id="padel-default",
            court_count=3,
        )
        await session.commit()

        assert len(created) == 15

        appearances: Counter[str] = Counter()
        for match, participants in created:
            assert match.stage_id == "s1"
            assert len(participants) == 2
            for participant in participants:
                assert len(participant.player_ids) == 2
                for pid in participant.player_ids:
                    appearances[pid] += 1

        assert set(appearances) == set(players)
        assert all(count == 4 for count in appearances.values())

        standings = (
            await session.execute(
                select(StageStanding).where(StageStanding.stage_id == "s1")
            )
        ).scalars().all()
        assert len(standings) == 15
        assert all(row.matches_played == 0 for row in standings)


@pytest.mark.anyio
async def test_list_stage_matches_filters_and_includes_stage_id():
    from app import db
    from app.models import (
        Sport,
        Tournament,
        Stage,
        Match,
        MatchAuditLog,
        MatchParticipant,
        ScoreEvent,
        Player,
        Rating,
        PlayerMetric,
        GlickoRating,
    )
    from app.routers import tournaments, matches

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
                Match.__table__,
                MatchAuditLog.__table__,
                MatchParticipant.__table__,
                ScoreEvent.__table__,
                Player.__table__,
                Rating.__table__,
                PlayerMetric.__table__,
                GlickoRating.__table__,
            ],
        )

    async with db.AsyncSessionLocal() as session:
        session.add(Sport(id="padel", name="Padel"))
        tournament = Tournament(id="t1", sport_id="padel", name="Championship")
        stage_a = Stage(id="s1", tournament_id="t1", type="americano", config=None)
        stage_b = Stage(id="s2", tournament_id="t1", type="americano", config=None)
        session.add_all([tournament, stage_a, stage_b])

        match_stage_a = Match(
            id="m-stage",
            sport_id="padel",
            stage_id="s1",
            best_of=3,
            is_friendly=False,
        )
        match_stage_b = Match(
            id="m-other",
            sport_id="padel",
            stage_id="s2",
            best_of=3,
            is_friendly=False,
        )
        match_no_stage = Match(
            id="m-loose",
            sport_id="padel",
            stage_id=None,
            best_of=5,
            is_friendly=True,
        )
        session.add_all([match_stage_a, match_stage_b, match_no_stage])

        session.add_all(
            [
                MatchParticipant(
                    id="mp1",
                    match_id="m-stage",
                    side="A",
                    player_ids=["p1", "p2"],
                ),
                MatchParticipant(
                    id="mp2",
                    match_id="m-stage",
                    side="B",
                    player_ids=["p3", "p4"],
                ),
                MatchParticipant(
                    id="mp3",
                    match_id="m-other",
                    side="A",
                    player_ids=["p5"],
                ),
                MatchParticipant(
                    id="mp4",
                    match_id="m-other",
                    side="B",
                    player_ids=["p6"],
                ),
            ]
        )

        await session.commit()

    app = _configured_app()
    app.include_router(tournaments.router)
    app.include_router(matches.router)

    with TestClient(app) as client:
        stage_resp = client.get("/tournaments/t1/stages/s1/matches")
        assert stage_resp.status_code == 200
        stage_matches = stage_resp.json()
        assert len(stage_matches) == 1
        assert stage_matches[0]["id"] == "m-stage"
        assert stage_matches[0]["stageId"] == "s1"
        assert stage_matches[0]["participants"]

        filtered_resp = client.get("/matches", params={"stageId": "s1"})
        assert filtered_resp.status_code == 200
        filtered = filtered_resp.json()
        assert len(filtered) == 1
        assert filtered[0]["id"] == "m-stage"
        assert filtered[0]["stageId"] == "s1"
        assert filtered[0]["isFriendly"] is False

        detail_resp = client.get("/matches/m-stage")
        assert detail_resp.status_code == 200
        detail = detail_resp.json()
        assert detail["stageId"] == "s1"
        assert detail["participants"]
