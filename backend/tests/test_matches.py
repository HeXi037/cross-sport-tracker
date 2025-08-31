import os
import sys
from pathlib import Path
import asyncio
from datetime import datetime
import pytest
from fastapi import HTTPException
from sqlalchemy import select, text

sys.path.append(str(Path(__file__).resolve().parents[1]))


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.anyio
async def test_create_match_by_name_rejects_duplicate_players(tmp_path):
    os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{tmp_path}/test.db"
    os.environ["JWT_SECRET"] = "testsecret"
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


@pytest.mark.anyio
async def test_create_match_rejects_duplicate_players(tmp_path):
    os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{tmp_path}/test.db"
    from app import db
    from app.schemas import MatchCreate, Participant
    from app.routers.matches import create_match

    db.engine = None
    db.AsyncSessionLocal = None
    db.get_engine()

    async with db.AsyncSessionLocal() as session:
        body = MatchCreate(
            sport="padel",
            participants=[
                Participant(side="A", playerIds=["p1"]),
                Participant(side="B", playerIds=["p1"]),
            ],
        )
        with pytest.raises(HTTPException) as exc:
            await create_match(body, session)
        assert exc.value.status_code == 400
        assert exc.value.detail == "duplicate players"


@pytest.mark.anyio
async def test_list_matches_returns_most_recent_first(tmp_path):
    os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{tmp_path}/test.db"
    os.environ["JWT_SECRET"] = "testsecret"
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app import db
    from app.models import Sport, Match
    from app.routers import matches

    db.engine = None
    db.AsyncSessionLocal = None
    engine = db.get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(
            db.Base.metadata.create_all,
            tables=[Sport.__table__, Match.__table__],
        )

    async with db.AsyncSessionLocal() as session:
        session.add(Sport(id="padel", name="Padel"))
        session.add(
            Match(id="m1", sport_id="padel", played_at=datetime(2024, 1, 1))
        )
        session.add(
            Match(id="m2", sport_id="padel", played_at=datetime(2024, 1, 2))
        )
        await session.commit()

    app = FastAPI()
    app.include_router(matches.router)

    with TestClient(app) as client:
        resp = client.get("/matches")
        assert resp.status_code == 200
        data = resp.json()
        assert [m["id"] for m in data] == ["m2", "m1"]


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

@pytest.mark.anyio
async def test_delete_match_requires_secret_and_marks_deleted(tmp_path):
    os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{tmp_path}/test.db"
    os.environ["JWT_SECRET"] = "testsecret"
    os.environ["ADMIN_SECRET"] = "admintest"
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app import db
    from app.models import Match, ScoreEvent, User
    from app.routers import matches, auth

    db.engine = None
    db.AsyncSessionLocal = None
    engine = db.get_engine()

    async with engine.begin() as conn:
        await conn.run_sync(Match.__table__.create)
        await conn.run_sync(ScoreEvent.__table__.create)
        await conn.run_sync(User.__table__.create)
        await conn.exec_driver_sql(
            "CREATE TABLE match_participant (id TEXT PRIMARY KEY, match_id TEXT, side TEXT, player_ids TEXT)"
        )

    async with db.AsyncSessionLocal() as session:
        mid = "m1"
        session.add(Match(id=mid, sport_id="padel"))
        await session.execute(
            text(
                "INSERT INTO match_participant (id, match_id, side, player_ids) VALUES (:id, :mid, 'A', '[]')"
            ),
            {"id": "mp1", "mid": mid},
        )
        session.add(
            ScoreEvent(
                id="e1",
                match_id=mid,
                type="POINT",
                payload={"type": "POINT", "by": "A"},
            )
        )
        await session.commit()

    app = FastAPI()
    app.include_router(auth.router)
    app.include_router(matches.router)
    client = TestClient(app)

    resp = client.delete(f"/matches/{mid}")
    assert resp.status_code == 401

    token_resp = client.post(
        "/auth/signup",
        json={"username": "admin", "password": "pw", "is_admin": True},
        headers={"X-Admin-Secret": "admintest"},
    )
    if token_resp.status_code != 200:
        token_resp = client.post(
            "/auth/login", json={"username": "admin", "password": "pw"}
        )
    token = token_resp.json()["access_token"]

    resp = client.delete(
        f"/matches/{mid}", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 204
    assert client.get(f"/matches/{mid}").status_code == 404

    async with db.AsyncSessionLocal() as session:
        m = await session.get(Match, mid)
        assert m is not None and m.deleted_at is not None
        mp_rows = await session.execute(
            text("SELECT * FROM match_participant WHERE match_id=:mid"), {"mid": mid}
        )
        assert mp_rows.fetchall() != []
        se_rows = (
            await session.execute(
                select(ScoreEvent).where(ScoreEvent.match_id == mid)
            )
        ).scalars().all()
        assert se_rows != []


@pytest.mark.anyio
async def test_delete_match_missing_returns_404(tmp_path):
    os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{tmp_path}/test.db"
    os.environ["JWT_SECRET"] = "testsecret"
    os.environ["ADMIN_SECRET"] = "admintest"
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app import db
    from app.models import Match, User
    from app.routers import matches, auth

    db.engine = None
    db.AsyncSessionLocal = None
    engine = db.get_engine()

    async with engine.begin() as conn:
        await conn.run_sync(Match.__table__.create)
        await conn.run_sync(User.__table__.create)

    app = FastAPI()
    app.include_router(auth.router)
    app.include_router(matches.router)
    with TestClient(app) as client:
        token_resp = client.post(
            "/auth/signup",
            json={"username": "admin", "password": "pw", "is_admin": True},
            headers={"X-Admin-Secret": "admintest"},
        )
        if token_resp.status_code != 200:
            token_resp = client.post(
                "/auth/login", json={"username": "admin", "password": "pw"}
            )
        token = token_resp.json()["access_token"]
        resp = client.delete(
            "/matches/unknown", headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 404
