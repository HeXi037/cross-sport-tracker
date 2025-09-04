import os
import sys
from pathlib import Path
import asyncio
from datetime import datetime
import pytest
from fastapi import HTTPException
from sqlalchemy import select, text

sys.path.append(str(Path(__file__).resolve().parents[1]))

# Ensure JWT secret meets minimum length requirement
os.environ["JWT_SECRET"] = "x" * 32


@pytest.fixture
def anyio_backend():
  return "asyncio"


@pytest.mark.anyio
async def test_create_match_by_name_rejects_duplicate_players(tmp_path):
  os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{tmp_path}/test.db"
  from app import db
  from app.models import Player, User
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
    admin = User(id="u1", username="admin", password_hash="", is_admin=True)
    with pytest.raises(HTTPException) as exc:
      await create_match_by_name(body, session, user=admin)
    assert exc.value.status_code == 400
    assert exc.value.detail == "duplicate players: Alice"


@pytest.mark.skip(reason="SQLite lacks ARRAY support for MatchParticipant")
@pytest.mark.anyio
async def test_create_match_rejects_duplicate_players(tmp_path):
  os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{tmp_path}/test.db"
  from app import db
  from app.models import User, Sport, Match, MatchParticipant
  from app.schemas import MatchCreate, Participant
  from app.routers.matches import create_match

  db.engine = None
  db.AsyncSessionLocal = None
  engine = db.get_engine()
  async with engine.begin() as conn:
    await conn.run_sync(
        db.Base.metadata.create_all,
        tables=[Sport.__table__, Match.__table__, MatchParticipant.__table__],
    )

  async with db.AsyncSessionLocal() as session:
    body = MatchCreate(
        sport="padel",
        participants=[
            Participant(side="A", playerIds=["p1"]),
            Participant(side="B", playerIds=["p1"]),
        ],
    )
    admin = User(id="u1", username="admin", password_hash="", is_admin=True)
    with pytest.raises(HTTPException) as exc:
      await create_match(body, session, user=admin)
    assert exc.value.status_code == 400
    assert exc.value.detail == "duplicate players"


@pytest.mark.skip(reason="SQLite lacks ARRAY support for MatchParticipant")
@pytest.mark.anyio
async def test_create_match_with_scores(tmp_path):
  os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{tmp_path}/test.db"
  from app import db
  from app.models import Match, MatchParticipant, Sport, User
  from app.schemas import MatchCreate, Participant
  from app.routers.matches import create_match

  db.engine = None
  db.AsyncSessionLocal = None
  engine = db.get_engine()
  async with engine.begin() as conn:
    await conn.run_sync(
        db.Base.metadata.create_all,
        tables=[Sport.__table__, Match.__table__, MatchParticipant.__table__],
    )

  async with db.AsyncSessionLocal() as session:
    session.add(Sport(id="bowling", name="Bowling"))
    await session.commit()
    body = MatchCreate(
        sport="bowling",
        participants=[
            Participant(side="A", playerIds=["p1"]),
            Participant(side="B", playerIds=["p2"]),
        ],
        score=[120, 100],
    )
    admin = User(id="u1", username="admin", password_hash="", is_admin=True)
    resp = await create_match(body, session, user=admin)
    m = await session.get(Match, resp.id)
    assert m.details == {"score": {"A": 120, "B": 100}}


@pytest.mark.anyio
async def test_list_matches_returns_most_recent_first(tmp_path):
  os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{tmp_path}/test.db"
  from fastapi import FastAPI
  from fastapi.testclient import TestClient
  from app import db
  from app.models import Sport, Match, User
  from app.routers import matches
  from app.routers.auth import get_current_user

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
    session.add(Match(id="m1", sport_id="padel", played_at=datetime(2024, 1, 1)))
    session.add(Match(id="m2", sport_id="padel", played_at=datetime(2024, 1, 2)))
    await session.commit()

  app = FastAPI()
  app.include_router(matches.router)
  app.dependency_overrides[get_current_user] = lambda: User(
      id="u1", username="admin", password_hash="", is_admin=True
  )

  with TestClient(app) as client:
    resp = client.get("/matches")
    assert resp.status_code == 200
    data = resp.json()
    ids = [m["id"] for m in data]
    sorted_ids = [
        m["id"]
        for m in sorted(data, key=lambda m: m["playedAt"], reverse=True)
    ]
    assert ids == sorted_ids
    assert resp.headers["X-Total-Count"] == "2"


@pytest.mark.anyio
async def test_list_matches_upcoming_filter(tmp_path):
  os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{tmp_path}/test.db"
  from fastapi import FastAPI
  from fastapi.testclient import TestClient
  from app import db
  from app.models import Sport, Match, User
  from app.routers import matches
  from app.routers.auth import get_current_user

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
    session.add(Match(id="past", sport_id="padel", played_at=datetime(2024, 1, 1)))
    session.add(Match(id="future", sport_id="padel", played_at=datetime(2999, 1, 1)))
    await session.commit()

  app = FastAPI()
  app.include_router(matches.router)
  app.dependency_overrides[get_current_user] = lambda: User(
      id="u1", username="admin", password_hash="", is_admin=True
  )

  with TestClient(app) as client:
    resp = client.get("/matches", params={"upcoming": True})
    assert resp.status_code == 200
    data = resp.json()
    assert [m["id"] for m in data] == ["future"]
    assert resp.headers["X-Total-Count"] == "1"


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
          tables=[
              Sport.__table__,
              Player.__table__,
              Match.__table__,
              MatchParticipant.__table__,
          ],
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
  os.environ["ADMIN_SECRET"] = "admintest"
  from fastapi import FastAPI
  from fastapi.testclient import TestClient
  from app import db
  from app.models import Match, ScoreEvent, User, Player, RefreshToken
  from app.routers import matches, auth

  db.engine = None
  db.AsyncSessionLocal = None
  engine = db.get_engine()

  async with engine.begin() as conn:
    await conn.run_sync(Match.__table__.create)
    await conn.run_sync(ScoreEvent.__table__.create)
    await conn.run_sync(User.__table__.create)
    await conn.run_sync(Player.__table__.create)
    await conn.run_sync(RefreshToken.__table__.create)
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
      json={"username": "admin", "password": "Str0ng!Pass", "is_admin": True},
      headers={"X-Admin-Secret": "admintest"},
  )
  if token_resp.status_code != 200:
    token_resp = client.post(
        "/auth/login", json={"username": "admin", "password": "Str0ng!Pass"}
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
        await session.execute(select(ScoreEvent).where(ScoreEvent.match_id == mid))
    ).scalars().all()
    assert se_rows != []


@pytest.mark.anyio
async def test_delete_match_missing_returns_404(tmp_path):
  os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{tmp_path}/test.db"
  os.environ["ADMIN_SECRET"] = "admintest"
  from fastapi import FastAPI
  from fastapi.testclient import TestClient
  from app import db
  from app.models import Match, User, Player, RefreshToken
  from app.routers import matches, auth

  db.engine = None
  db.AsyncSessionLocal = None
  engine = db.get_engine()

  async with engine.begin() as conn:
    await conn.run_sync(Match.__table__.create)
    await conn.run_sync(User.__table__.create)
    await conn.run_sync(Player.__table__.create)
    await conn.run_sync(RefreshToken.__table__.create)

  app = FastAPI()
  app.include_router(auth.router)
  app.include_router(matches.router)
  with TestClient(app) as client:
    token_resp = client.post(
        "/auth/signup",
        json={"username": "admin", "password": "Str0ng!Pass", "is_admin": True},
        headers={"X-Admin-Secret": "admintest"},
    )
    if token_resp.status_code != 200:
      token_resp = client.post(
          "/auth/login", json={"username": "admin", "password": "Str0ng!Pass"}
      )
    token = token_resp.json()["access_token"]
    resp = client.delete(
        "/matches/unknown", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 404


@pytest.mark.anyio
async def test_delete_match_updates_ratings_and_leaderboard(tmp_path):
  prev_db = os.environ.get("DATABASE_URL")
  os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{tmp_path}/test.db"
  from sqlalchemy.dialects.sqlite import JSON
  from app import db
  from app.models import (
      Player,
      Rating,
      Sport,
      Match,
      MatchParticipant,
      ScoreEvent,
      User,
  )
  from app.schemas import MatchCreate, Participant
  from app.routers.matches import create_match, delete_match
  from app.routers.leaderboards import leaderboard
  from app.services import update_ratings

  db.engine = None
  db.AsyncSessionLocal = None
  engine = db.get_engine()

  # Patch player_ids to use JSON for SQLite
  MatchParticipant.__table__.columns["player_ids"].type = JSON()

  async with engine.begin() as conn:
    await conn.run_sync(
        db.Base.metadata.create_all,
        tables=[
            Sport.__table__,
            Player.__table__,
            Rating.__table__,
            Match.__table__,
            ScoreEvent.__table__,
        ],
    )
    await conn.exec_driver_sql(
        """
        CREATE TABLE match_participant (
            id TEXT PRIMARY KEY,
            match_id TEXT,
            side TEXT,
            player_ids JSON
        )
        """
    )

  async with db.AsyncSessionLocal() as session:
    session.add_all(
        [
            Sport(id="padel", name="Padel"),
            Player(id="p1", name="Alice"),
            Player(id="p2", name="Bob"),
            Player(id="p3", name="Carol"),
        ]
    )
    await session.commit()
    admin = User(id="u1", username="admin", password_hash="", is_admin=True)

    body1 = MatchCreate(
        sport="padel",
        participants=[
            Participant(side="A", playerIds=["p1"]),
            Participant(side="B", playerIds=["p2"]),
        ],
        playedAt=datetime(2024, 1, 1),
    )
    mid1 = (await create_match(body1, session, user=admin)).id
    m1 = await session.get(Match, mid1)
    m1.details = {"sets": {"A": 2, "B": 0}}
    await update_ratings(session, "padel", ["p1"], ["p2"])
    await session.commit()

    body2 = MatchCreate(
        sport="padel",
        participants=[
            Participant(side="A", playerIds=["p2"]),
            Participant(side="B", playerIds=["p3"]),
        ],
        playedAt=datetime(2024, 1, 2),
    )
    mid2 = (await create_match(body2, session, user=admin)).id
    m2 = await session.get(Match, mid2)
    m2.details = {"sets": {"A": 2, "B": 0}}
    await update_ratings(session, "padel", ["p2"], ["p3"])
    await session.commit()

    lb_before = await leaderboard("padel", session=session)
    assert [e.playerId for e in lb_before.leaders] == ["p1", "p2", "p3"]

    admin = User(id="u1", username="admin", password_hash="", is_admin=True)
    await delete_match(mid1, session, user=admin)

    lb_after = await leaderboard("padel", session=session)
    assert [e.playerId for e in lb_after.leaders] == ["p2", "p1", "p3"]

    rows = (
        await session.execute(
            select(Rating).where(Rating.sport_id == "padel").order_by(Rating.player_id)
        )
    ).scalars().all()
    ratings = {r.player_id: r.value for r in rows}
    assert ratings["p1"] == pytest.approx(1000.0)
    assert ratings["p2"] > ratings["p1"] > ratings["p3"]

  if prev_db is None:
    del os.environ["DATABASE_URL"]
  else:
    os.environ["DATABASE_URL"] = prev_db


@pytest.mark.anyio
async def test_create_match_preserves_naive_date(tmp_path):
  os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{tmp_path}/test.db"
  from fastapi import FastAPI
  from fastapi.testclient import TestClient
  from app import db
  from app.models import Sport, Match, User
  from app.routers import matches
  from app.routers.auth import get_current_user

  db.engine = None
  db.AsyncSessionLocal = None
  engine = db.get_engine()
  async with engine.begin() as conn:
    await conn.run_sync(
        db.Base.metadata.create_all, tables=[Sport.__table__, Match.__table__]
    )

  async with db.AsyncSessionLocal() as session:
    session.add(Sport(id="padel", name="Padel"))
    await session.commit()

  app = FastAPI()
  app.include_router(matches.router)
  app.dependency_overrides[get_current_user] = lambda: User(
      id="u1", username="admin", password_hash="", is_admin=True
  )

  with TestClient(app) as client:
    payload = {
        "sport": "padel",
        "participants": [],
        "playedAt": "2024-01-01T00:00:00",
    }
    resp = client.post("/matches", json=payload)
    assert resp.status_code == 200
    mid = resp.json()["id"]

  async with db.AsyncSessionLocal() as session:
    match = await session.get(Match, mid)
    assert match is not None
    assert match.played_at.isoformat() == "2024-01-01T00:00:00"
