import os
import sys
from pathlib import Path
import asyncio
from datetime import datetime, timezone
import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import select, text

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.models import MatchAuditLog, Stage


@pytest.fixture
def anyio_backend():
  return "asyncio"


def test_match_create_normalizes_sides_and_requires_players():
  from app.schemas import MatchCreate

  body = MatchCreate(
    sport="padel",
    participants=[
      {"side": "a", "playerIds": ["p1"]},
      {"side": "B", "playerIds": ["p2"]},
    ],
  )

  assert [p.side for p in body.participants] == ["A", "B"]


def test_match_create_rejects_duplicate_sides():
  from app.schemas import MatchCreate

  with pytest.raises(ValidationError) as exc:
    MatchCreate(
      sport="padel",
      participants=[
        {"side": "A", "playerIds": ["p1"]},
        {"side": "a", "playerIds": ["p2"]},
      ],
    )

  assert "unique sides" in str(exc.value)


def test_match_create_rejects_empty_player_ids():
  from app.schemas import MatchCreate

  with pytest.raises(ValidationError) as exc:
    MatchCreate(
      sport="padel",
      participants=[
        {"side": "A", "playerIds": []},
      ],
    )

  assert "include at least one player" in str(exc.value)


def test_match_create_by_name_normalizes_sides():
  from app.schemas import MatchCreateByName

  body = MatchCreateByName(
    sport="padel",
    participants=[
      {"side": "a", "playerNames": ["Alice"]},
      {"side": "B", "playerNames": ["Bob"]},
    ],
  )

  assert [p.side for p in body.participants] == ["A", "B"]


def test_match_create_by_name_rejects_duplicate_sides():
  from app.schemas import MatchCreateByName

  with pytest.raises(ValidationError) as exc:
    MatchCreateByName(
      sport="padel",
      participants=[
        {"side": "A", "playerNames": ["Alice"]},
        {"side": "a", "playerNames": ["Bob"]},
      ],
    )

  assert "unique sides" in str(exc.value)


def test_match_create_by_name_rejects_empty_player_names():
  from app.schemas import MatchCreateByName

  with pytest.raises(ValidationError) as exc:
    MatchCreateByName(
      sport="padel",
      participants=[
        {"side": "A", "playerNames": []},
      ],
    )

  assert "include at least one player" in str(exc.value)


@pytest.mark.anyio
async def test_create_match_by_name_rejects_duplicate_players(tmp_path):
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
    session.add(Player(id="p1", name="alice"))
    await session.commit()
    body = MatchCreateByName(
        sport="padel",
        participants=[
            ParticipantByName(side="A", playerNames=["Alice"]),
            ParticipantByName(side="B", playerNames=["ALICE"]),
        ],
    )
    admin = User(id="u1", username="admin", password_hash="", is_admin=True)
    with pytest.raises(HTTPException) as exc:
      await create_match_by_name(body, session, user=admin)
    assert exc.value.status_code == 400
    assert exc.value.detail == "duplicate players: alice"


@pytest.mark.anyio
async def test_create_match_rejects_duplicate_players(tmp_path):
  from app import db
  from app.models import Club, Match, MatchParticipant, Player, Sport, User
  from app.schemas import MatchCreate, Participant
  from app.routers.matches import create_match

  db.engine = None
  db.AsyncSessionLocal = None
  engine = db.get_engine()
  async with engine.begin() as conn:
    await conn.run_sync(
        db.Base.metadata.create_all,
        tables=[
            Sport.__table__,
            Stage.__table__,
            Club.__table__,
            Match.__table__,
            MatchParticipant.__table__,
        MatchAuditLog.__table__,
        ],
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


@pytest.mark.anyio
async def test_create_match_rejects_unknown_club(tmp_path):
  from app import db
  from app.models import Club, Match, MatchParticipant, Player, Sport, User
  from app.schemas import MatchCreate, Participant
  from app.routers.matches import create_match

  db.engine = None
  db.AsyncSessionLocal = None
  engine = db.get_engine()
  async with engine.begin() as conn:
    await conn.run_sync(
      db.Base.metadata.create_all,
      tables=[
        Sport.__table__,
        Player.__table__,
        Club.__table__,
        Stage.__table__,
        Match.__table__,
        MatchParticipant.__table__,
        MatchAuditLog.__table__,
      ],
    )

  async with db.AsyncSessionLocal() as session:
    session.add_all([
      Sport(id="padel", name="Padel"),
      Player(id="p1", name="alice"),
      Player(id="p2", name="bob"),
    ])
    await session.commit()

    body = MatchCreate(
      sport="padel",
      participants=[
        Participant(side="A", playerIds=["p1"]),
        Participant(side="B", playerIds=["p2"]),
      ],
      clubId="club-unknown",
    )
    admin = User(id="u1", username="admin", password_hash="", is_admin=True)
    with pytest.raises(HTTPException) as exc:
      await create_match(body, session, user=admin)

    assert exc.value.status_code == 400
    assert exc.value.detail == "unknown club: club-unknown"
    assert getattr(exc.value, "code", "") == "match_unknown_club"


@pytest.mark.anyio
async def test_create_match_friendly_skips_stat_updates(tmp_path, monkeypatch):
  from app import db
  from app.models import Match, MatchParticipant, Player, ScoreEvent, Sport, User
  from app.routers.matches import create_match
  from app.schemas import MatchCreate, Participant

  db.engine = None
  db.AsyncSessionLocal = None
  engine = db.get_engine()
  async with engine.begin() as conn:
    await conn.run_sync(
      db.Base.metadata.create_all,
      tables=[
        Sport.__table__,
        Player.__table__,
        Stage.__table__,
        Match.__table__,
        MatchParticipant.__table__,
        MatchAuditLog.__table__,
        ScoreEvent.__table__,
      ],
    )

  async with db.AsyncSessionLocal() as session:
    session.add_all(
      [
        Sport(id="padel", name="Padel"),
        Player(id="p1", name="alice"),
        Player(id="p2", name="bob"),
      ]
    )
    await session.commit()

    calls: dict[str, int] = {"ratings": 0, "metrics": 0, "invalidate": 0}

    async def fake_update_ratings(*args, **kwargs):  # type: ignore[no-untyped-def]
      calls["ratings"] += 1

    async def fake_update_player_metrics(*args, **kwargs):  # type: ignore[no-untyped-def]
      calls["metrics"] += 1

    async def fake_invalidate_players(*args, **kwargs):  # type: ignore[no-untyped-def]
      calls["invalidate"] += 1

    monkeypatch.setattr("app.routers.matches.update_ratings", fake_update_ratings)
    monkeypatch.setattr(
      "app.routers.matches.update_player_metrics",
      fake_update_player_metrics,
    )
    monkeypatch.setattr(
      "app.routers.matches.player_stats_cache.invalidate_players",
      fake_invalidate_players,
    )

    admin = User(id="u1", username="admin", password_hash="", is_admin=True)
    body = MatchCreate(
      sport="padel",
      participants=[
        Participant(side="A", playerIds=["p1"]),
        Participant(side="B", playerIds=["p2"]),
      ],
      sets=[[6, 0], [6, 0]],
      isFriendly=True,
    )

    resp = await create_match(body, session, user=admin)
    assert resp.id
    assert calls == {"ratings": 0, "metrics": 0, "invalidate": 0}


@pytest.mark.anyio
async def test_create_match_by_name_is_case_insensitive(tmp_path):
  from app import db
  from app.models import Player, Sport, Match, MatchParticipant, User
  from app.schemas import MatchCreateByName, ParticipantByName
  from app.routers.matches import create_match_by_name

  db.engine = None
  db.AsyncSessionLocal = None
  engine = db.get_engine()
  async with engine.begin() as conn:
    await conn.run_sync(
      db.Base.metadata.create_all,
      tables=[
        Player.__table__,
        Sport.__table__,
        Stage.__table__,
        Match.__table__,
        MatchParticipant.__table__,
        MatchAuditLog.__table__,
      ],
    )

  async with db.AsyncSessionLocal() as session:
    session.add_all([
      Player(id="p1", name="alice"),
      Player(id="p2", name="bob"),
      Sport(id="padel", name="Padel"),
    ])
    await session.commit()
    body = MatchCreateByName(
      sport="padel",
      participants=[
        ParticipantByName(side="A", playerNames=["Alice"]),
        ParticipantByName(side="B", playerNames=["Bob"]),
      ],
    )
    admin = User(id="u1", username="admin", password_hash="", is_admin=True)
    resp = await create_match_by_name(body, session, user=admin)
    assert resp.id
    m = await session.get(Match, resp.id)
    assert m is not None


@pytest.mark.anyio
async def test_create_match_by_name_trims_whitespace(tmp_path):
  from app import db
  from app.models import Player, Sport, Match, MatchParticipant, User
  from app.schemas import MatchCreateByName, ParticipantByName
  from app.routers.matches import create_match_by_name

  db.engine = None
  db.AsyncSessionLocal = None
  engine = db.get_engine()
  async with engine.begin() as conn:
    await conn.run_sync(
      db.Base.metadata.create_all,
      tables=[
        Player.__table__,
        Sport.__table__,
        Stage.__table__,
        Match.__table__,
        MatchParticipant.__table__,
        MatchAuditLog.__table__,
      ],
    )

  async with db.AsyncSessionLocal() as session:
    session.add_all([
      Player(id="p1", name="alice"),
      Player(id="p2", name="bob"),
      Sport(id="padel", name="Padel"),
    ])
    await session.commit()
    body = MatchCreateByName(
      sport="padel",
      participants=[
        ParticipantByName(side="A", playerNames=["  Alice  "]),
        ParticipantByName(side="B", playerNames=["Bob   "]),
      ],
    )
    admin = User(id="u1", username="admin", password_hash="", is_admin=True)
    resp = await create_match_by_name(body, session, user=admin)
    assert resp.id
    participants = (
      await session.execute(
        select(MatchParticipant).where(MatchParticipant.match_id == resp.id)
      )
    ).scalars().all()
    assert sorted(part.player_ids for part in participants) == [["p1"], ["p2"]]


@pytest.mark.anyio
async def test_create_match_with_sets(tmp_path):
  from app import db
  from app.models import Match, MatchParticipant, Player, Sport, User
  from app.schemas import MatchCreate, Participant
  from app.routers.matches import create_match

  db.engine = None
  db.AsyncSessionLocal = None
  engine = db.get_engine()
  async with engine.begin() as conn:
    await conn.run_sync(
      db.Base.metadata.create_all,
      tables=[
        Sport.__table__,
        Player.__table__,
        Stage.__table__,
        Match.__table__,
        MatchParticipant.__table__,
        MatchAuditLog.__table__,
      ],
    )

  async with db.AsyncSessionLocal() as session:
    session.add_all(
      [
        Player(id="p1", name="alice"),
        Player(id="p2", name="bob"),
      ]
    )
    await session.commit()
    body = MatchCreate(
        sport="bowling",
        participants=[
            Participant(side="A", playerIds=["p1"]),
            Participant(side="B", playerIds=["p2"]),
        ],
        sets=[[120], [100]],
    )
    admin = User(id="u1", username="admin", password_hash="", is_admin=True)
    resp = await create_match(body, session, user=admin)
    m = await session.get(Match, resp.id)
    assert m.details is not None
    assert m.details.get("score") == {"A": 120, "B": 100}
    assert m.details.get("set_scores") == [{"A": 120, "B": 100}]
    assert m.details.get("sets") == {"A": 1, "B": 0}


@pytest.mark.anyio
async def test_create_match_with_details(tmp_path):
  from app import db
  from app.models import Match, MatchParticipant, Player, Sport, User
  from app.schemas import MatchCreate, Participant
  from app.routers.matches import create_match

  db.engine = None
  db.AsyncSessionLocal = None
  engine = db.get_engine()
  async with engine.begin() as conn:
    await conn.run_sync(
      db.Base.metadata.create_all,
      tables=[
        Sport.__table__,
        Player.__table__,
        Stage.__table__,
        Match.__table__,
        MatchParticipant.__table__,
        MatchAuditLog.__table__,
      ],
    )

  async with db.AsyncSessionLocal() as session:
    session.add(Player(id="p1", name="alice"))
    await session.commit()
    body = MatchCreate(
        sport="bowling",
        participants=[Participant(side="A", playerIds=["p1"])],
        score=[180],
        details={"players": [{"side": "A", "total": 180}]},
    )
    admin = User(id="u1", username="admin", password_hash="", is_admin=True)
    resp = await create_match(body, session, user=admin)
    m = await session.get(Match, resp.id)
    assert m.details == {
        "players": [{"side": "A", "total": 180}],
        "score": {"A": 180},
    }


@pytest.mark.anyio
async def test_bowling_match_details_compute_score_and_ratings(tmp_path):
  from app import db
  from app.models import (
    GlickoRating,
    Match,
    MatchParticipant,
    Player,
    PlayerMetric,
    Rating,
    ScoreEvent,
    Sport,
    User,
  )
  from app.schemas import MatchCreate, Participant
  from app.routers.matches import create_match
  from sqlalchemy import select

  db.engine = None
  db.AsyncSessionLocal = None
  engine = db.get_engine()
  async with engine.begin() as conn:
    await conn.run_sync(db.Base.metadata.create_all)

  async with db.AsyncSessionLocal() as session:
    session.add_all([
      Sport(id="bowling", name="Bowling"),
      Player(id="pa", name="Alice"),
      Player(id="pb", name="Bob"),
    ])
    await session.commit()

    body = MatchCreate(
      sport="bowling",
      participants=[
        Participant(side="A", playerIds=["pa"]),
        Participant(side="B", playerIds=["pb"]),
      ],
      details={
        "players": [
          {"id": "pa", "side": "A", "total": 215, "frameScores": [10, 20]},
          {"id": "pb", "side": "B", "total": 198, "frameScores": [9, 19]},
        ]
      },
    )

    admin = User(id="admin", username="admin", password_hash="", is_admin=True)
    resp = await create_match(body, session, user=admin)

    m = await session.get(Match, resp.id)
    assert m.details is not None
    assert m.details.get("score") == {"A": 215, "B": 198}
    players = m.details.get("players") or []
    assert all(isinstance(p, dict) and "scores" in p for p in players)

    ratings = (await session.execute(select(Rating))).scalars().all()
    rating_map = {r.player_id: r.value for r in ratings}
    assert rating_map.get("pa", 0) > rating_map.get("pb", 0)

    score_events = (
      await session.execute(select(ScoreEvent).where(ScoreEvent.match_id == resp.id))
    ).scalars().all()
    assert score_events, "rating events should be recorded for bowling matches"


@pytest.mark.anyio
async def test_bowling_leaderboard_includes_all_players(tmp_path):
  from sqlalchemy.dialects.sqlite import JSON
  from app import db
  from app.models import (
    GlickoRating,
    Match,
    MatchParticipant,
    Player,
    PlayerMetric,
    Rating,
    ScoreEvent,
    Sport,
    User,
  )
  from app.schemas import MatchCreate, Participant
  from app.routers.matches import create_match
  from app.routers.leaderboards import leaderboard
  from sqlalchemy import select

  db.engine = None
  db.AsyncSessionLocal = None
  engine = db.get_engine()

  # Ensure player_ids works with SQLite JSON
  MatchParticipant.__table__.columns["player_ids"].type = JSON()

  async with engine.begin() as conn:
    await conn.run_sync(db.Base.metadata.create_all)

  async with db.AsyncSessionLocal() as session:
    admin = User(id="admin", username="admin", password_hash="", is_admin=True)
    session.add_all([
      Sport(id="bowling", name="Bowling"),
      Player(id="p1", name="One"),
      Player(id="p2", name="Two"),
      Player(id="p3", name="Three"),
      Player(id="p4", name="Four"),
      admin,
    ])
    await session.commit()

    body = MatchCreate(
      sport="bowling",
      participants=[
        Participant(side="A", playerIds=["p1"]),
        Participant(side="B", playerIds=["p2"]),
        Participant(side="C", playerIds=["p3"]),
        Participant(side="D", playerIds=["p4"]),
      ],
      score=[210, 180, 170, 150],
    )

    await create_match(body, session, user=admin)

    ratings = (
      await session.execute(
        select(Rating).where(Rating.sport_id == "bowling").order_by(Rating.player_id)
      )
    ).scalars().all()
    assert [r.player_id for r in ratings] == ["p1", "p2", "p3", "p4"]

    lb = await leaderboard("bowling", session=session)
    assert lb.total == 4
    assert sorted(entry.playerId for entry in lb.leaders) == ["p1", "p2", "p3", "p4"]


@pytest.mark.anyio
async def test_create_match_with_draw_updates_ratings(tmp_path):
  from app import db
  from app.models import (
    GlickoRating,
    Match,
    MatchParticipant,
    Player,
    PlayerMetric,
    Rating,
    ScoreEvent,
    Sport,
    User,
  )
  from app.schemas import MatchCreate, Participant
  from app.routers.matches import create_match
  from sqlalchemy import select

  db.engine = None
  db.AsyncSessionLocal = None
  engine = db.get_engine()
  async with engine.begin() as conn:
    await conn.run_sync(
      db.Base.metadata.create_all,
      tables=[
        Sport.__table__,
        Player.__table__,
        Match.__table__,
        MatchParticipant.__table__,
        MatchAuditLog.__table__,
        Rating.__table__,
        GlickoRating.__table__,
        PlayerMetric.__table__,
        ScoreEvent.__table__,
      ],
    )

  async with db.AsyncSessionLocal() as session:
    session.add_all([
      Sport(id="bowling", name="Bowling"),
      Player(id="pa", name="Alice"),
      Player(id="pb", name="Bob"),
      Rating(id="r_pa", player_id="pa", sport_id="bowling", value=1200),
      Rating(id="r_pb", player_id="pb", sport_id="bowling", value=1000),
    ])
    await session.commit()

    body = MatchCreate(
      sport="bowling",
      participants=[
        Participant(side="A", playerIds=["pa"]),
        Participant(side="B", playerIds=["pb"]),
      ],
      sets=[(6, 6)],
    )

    admin = User(id="admin", username="admin", password_hash="", is_admin=True)
    resp = await create_match(body, session, user=admin)

    ratings = (
      await session.execute(select(Rating).order_by(Rating.player_id))
    ).scalars().all()
    rating_map = {r.player_id: r.value for r in ratings}
    assert rating_map["pa"] < 1200
    assert rating_map["pb"] > 1000

    score_events = (
      await session.execute(select(ScoreEvent).where(ScoreEvent.match_id == resp.id))
    ).scalars().all()
    assert any(ev.type == "RATING" for ev in score_events)


@pytest.mark.anyio
async def test_create_match_by_name_with_sets(tmp_path):
  from app import db
  from app.models import Match, MatchParticipant, Player, Sport, User
  from app.schemas import MatchCreateByName, ParticipantByName
  from app.routers.matches import create_match_by_name

  db.engine = None
  db.AsyncSessionLocal = None
  engine = db.get_engine()
  async with engine.begin() as conn:
    await conn.run_sync(
      db.Base.metadata.create_all,
      tables=[
        Player.__table__,
        Sport.__table__,
        Stage.__table__,
        Match.__table__,
        MatchParticipant.__table__,
        MatchAuditLog.__table__,
      ],
    )

  async with db.AsyncSessionLocal() as session:
    session.add_all([
      Player(id="p1", name="alice"),
      Player(id="p2", name="bob"),
      Sport(id="bowling", name="Bowling"),
    ])
    await session.commit()
    body = MatchCreateByName(
      sport="bowling",
      participants=[
        ParticipantByName(side="A", playerNames=["Alice"]),
        ParticipantByName(side="B", playerNames=["Bob"]),
      ],
      sets=[(120, 100)],
    )
    admin = User(id="u1", username="admin", password_hash="", is_admin=True)
    resp = await create_match_by_name(body, session, user=admin)
    m = await session.get(Match, resp.id)
    assert m.details is not None
    assert m.details.get("score") == {"A": 120, "B": 100}
    assert m.details.get("set_scores") == [{"A": 120, "B": 100}]
    assert m.details.get("sets") == {"A": 1, "B": 0}


@pytest.mark.anyio
async def test_create_match_by_name_accepts_list_of_set_pairs(tmp_path, monkeypatch):
  from app import db
  from app.models import Match, MatchParticipant, Player, ScoreEvent, Sport, User
  from app.routers import matches
  from app.schemas import MatchCreateByName, ParticipantByName

  db.engine = None
  db.AsyncSessionLocal = None
  engine = db.get_engine()
  async with engine.begin() as conn:
    await conn.run_sync(
      db.Base.metadata.create_all,
      tables=[
        Player.__table__,
        Sport.__table__,
        Stage.__table__,
        Match.__table__,
        MatchParticipant.__table__,
        MatchAuditLog.__table__,
        ScoreEvent.__table__,
      ],
    )

  async def dummy_broadcast(mid: str, message: dict) -> None:
    return None

  async def dummy_notify(*args, **kwargs) -> None:  # type: ignore[no-untyped-def]
    return None

  monkeypatch.setattr(matches, "broadcast", dummy_broadcast)
  monkeypatch.setattr(matches, "notify_match_recorded", dummy_notify)

  async with db.AsyncSessionLocal() as session:
    session.add_all([
      Player(id="p1", name="alice"),
      Player(id="p2", name="bob"),
      Sport(id="padel", name="Padel"),
    ])
    await session.commit()
    body = MatchCreateByName(
      sport="padel",
      participants=[
        ParticipantByName(side="A", playerNames=["Alice"]),
        ParticipantByName(side="B", playerNames=["Bob"]),
      ],
      sets=[[6, 4], [6, 2]],
      isFriendly=True,
    )
    admin = User(id="u1", username="admin", password_hash="", is_admin=True)
    resp = await matches.create_match_by_name(body, session, user=admin)
    assert resp.id
    m = await session.get(Match, resp.id)
    assert m is not None
    assert m.details is not None
    assert m.details.get("set_scores") == [{"A": 6, "B": 4}, {"A": 6, "B": 2}]
    assert m.details.get("sets") == {"A": 2, "B": 0}


@pytest.mark.anyio
async def test_create_match_normalizes_timezone(tmp_path):
  from fastapi import FastAPI
  from fastapi.testclient import TestClient
  from slowapi.errors import RateLimitExceeded
  from app import db
  from app.models import Match, MatchParticipant, Player, Sport, User
  from app.routers import matches, auth
  from app.routers.auth import get_current_user

  db.engine = None
  db.AsyncSessionLocal = None
  engine = db.get_engine()
  async with engine.begin() as conn:
    await conn.run_sync(
      db.Base.metadata.create_all,
      tables=[
        Sport.__table__,
        Player.__table__,
        Stage.__table__,
        Match.__table__,
        MatchParticipant.__table__,
        MatchAuditLog.__table__,
      ],
    )

  async with db.AsyncSessionLocal() as session:
    session.add(Sport(id="padel", name="Padel"))
    session.add_all([Player(id="p1", name="alice"), Player(id="p2", name="bob")])
    await session.commit()

  app = FastAPI()
  app.state.limiter = auth.limiter
  app.add_exception_handler(RateLimitExceeded, auth.rate_limit_handler)
  app.include_router(matches.router)
  app.dependency_overrides[get_current_user] = lambda: User(
      id="u1", username="admin", password_hash="", is_admin=True
  )

  with TestClient(app) as client:
    resp = client.post(
      "/matches",
      json={
        "sport": "padel",
        "participants": [
          {"side": "A", "playerIds": ["p1"]},
          {"side": "B", "playerIds": ["p2"]},
        ],
        "playedAt": "2025-09-12T02:30:00Z",
      },
    )
    assert resp.status_code == 200
    mid = resp.json()["id"]

  async with db.AsyncSessionLocal() as session:
    m = await session.get(Match, mid)
    assert m.played_at.tzinfo is None
    assert m.played_at == datetime(2025, 9, 12, 2, 30)


@pytest.mark.anyio
async def test_list_matches_returns_most_recent_first(tmp_path):
  from fastapi import FastAPI
  from fastapi.testclient import TestClient
  from slowapi.errors import RateLimitExceeded
  from app import db
  from app.models import Sport, Match, MatchParticipant, Player, Stage, User
  from app.routers import matches, auth
  from app.routers.auth import get_current_user

  db.engine = None
  db.AsyncSessionLocal = None
  engine = db.get_engine()
  async with engine.begin() as conn:
    await conn.run_sync(
        db.Base.metadata.create_all,
        tables=[
            Sport.__table__,
            Stage.__table__,
            Match.__table__,
            MatchParticipant.__table__,
        MatchAuditLog.__table__,
            Player.__table__,
        ],
    )

  async with db.AsyncSessionLocal() as session:
    session.add(Sport(id="padel", name="Padel"))
    session.add(
        Match(
            id="m1",
            sport_id="padel",
            played_at=datetime(2024, 1, 1, tzinfo=timezone.utc),
        )
    )
    session.add(
        Match(
            id="m2",
            sport_id="padel",
            played_at=datetime(2024, 1, 2, tzinfo=timezone.utc),
        )
    )
    await session.commit()

  app = FastAPI()
  app.state.limiter = auth.limiter
  app.add_exception_handler(RateLimitExceeded, auth.rate_limit_handler)
  app.include_router(matches.router)
  app.dependency_overrides[get_current_user] = lambda: User(
      id="u1", username="admin", password_hash="", is_admin=True
  )

  with TestClient(app) as client:
    resp = client.get("/matches")
    assert resp.status_code == 200
    matches = resp.json()
    assert isinstance(matches, list)
    ids = [m["id"] for m in matches]
    sorted_ids = [
        m["id"]
        for m in sorted(matches, key=lambda m: m["playedAt"], reverse=True)
    ]
    assert ids == sorted_ids
    assert resp.headers.get("x-has-more") == "false"
    assert resp.headers.get("x-next-offset") is None
    for match in matches:
        assert match.get("participants") == []
        assert "summary" in match
    assert all(
        (
            m["playedAt"] is None
            or str(m["playedAt"]).endswith("Z")
            or str(m["playedAt"]).endswith("+00:00")
        )
        for m in matches
    )


@pytest.mark.anyio
async def test_list_matches_upcoming_filter(tmp_path):
  from fastapi import FastAPI
  from fastapi.testclient import TestClient
  from slowapi.errors import RateLimitExceeded
  from app import db
  from app.models import Sport, Match, MatchParticipant, Player, User
  from app.routers import matches, auth
  from app.routers.auth import get_current_user

  db.engine = None
  db.AsyncSessionLocal = None
  engine = db.get_engine()
  async with engine.begin() as conn:
    await conn.run_sync(
        db.Base.metadata.create_all,
        tables=[
            Sport.__table__,
            Stage.__table__,
            Match.__table__,
            MatchParticipant.__table__,
        MatchAuditLog.__table__,
            Player.__table__,
        ],
    )

  async with db.AsyncSessionLocal() as session:
    session.add(Sport(id="padel", name="Padel"))
    session.add(
        Match(
            id="past",
            sport_id="padel",
            played_at=datetime(2024, 1, 1, tzinfo=timezone.utc),
        )
    )
    session.add(Match(id="future", sport_id="padel", played_at=datetime(2999, 1, 1)))
    await session.commit()

  app = FastAPI()
  app.state.limiter = auth.limiter
  app.add_exception_handler(RateLimitExceeded, auth.rate_limit_handler)
  app.include_router(matches.router)
  app.dependency_overrides[get_current_user] = lambda: User(
      id="u1", username="admin", password_hash="", is_admin=True
  )

  with TestClient(app) as client:
    resp = client.get("/matches", params={"upcoming": True})
    assert resp.status_code == 200
    data = resp.json()
    assert [m["id"] for m in data] == ["future"]
    assert resp.headers.get("x-has-more") == "false"
    assert data[0]["participants"] == []


@pytest.mark.anyio
async def test_list_matches_omits_soft_deleted_player_details(tmp_path):
  from datetime import datetime, timezone
  from fastapi import FastAPI
  from fastapi.testclient import TestClient
  from slowapi.errors import RateLimitExceeded
  from app import db
  from app.models import Sport, Match, MatchParticipant, Player, User
  from app.routers import matches, auth
  from app.routers.auth import get_current_user

  db.engine = None
  db.AsyncSessionLocal = None
  engine = db.get_engine()
  async with engine.begin() as conn:
    await conn.run_sync(
        db.Base.metadata.create_all,
        tables=[
            Sport.__table__,
            Stage.__table__,
            Match.__table__,
            MatchParticipant.__table__,
        MatchAuditLog.__table__,
            Player.__table__,
        ],
    )

  async with db.AsyncSessionLocal() as session:
    session.add(Sport(id="padel", name="Padel"))
    session.add(Player(id="active", name="Alice"))
    session.add(
        Player(
            id="deleted",
            name="Bob",
            photo_url="https://example.com/deleted.jpg",
            deleted_at=datetime(2024, 1, 1, tzinfo=timezone.utc),
        )
    )
    session.add(
        Match(
            id="m1",
            sport_id="padel",
            played_at=datetime(2024, 2, 1, tzinfo=timezone.utc),
        )
    )
    session.add(
        MatchParticipant(
            id="part-a",
            match_id="m1",
            side="A",
            player_ids=["active"],
        )
    )
    session.add(
        MatchParticipant(
            id="part-b",
            match_id="m1",
            side="B",
            player_ids=["deleted"],
        )
    )
    await session.commit()

  app = FastAPI()
  app.state.limiter = auth.limiter
  app.add_exception_handler(RateLimitExceeded, auth.rate_limit_handler)
  app.include_router(matches.router)
  app.dependency_overrides[get_current_user] = lambda: User(
      id="u1", username="admin", password_hash="", is_admin=True
  )

  with TestClient(app) as client:
    resp = client.get("/matches")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    participants = data[0]["participants"]
    assert len(participants) == 2

    side_a = next(part for part in participants if part["side"] == "A")
    side_b = next(part for part in participants if part["side"] == "B")

    assert side_a["players"] == [
        {"id": "active", "name": "Alice", "photo_url": None}
    ]
    assert side_b["players"] == [
        {"id": "deleted", "name": "Unknown", "photo_url": None}
    ]


@pytest.mark.skip(reason="SQLite lacks ARRAY support for MatchParticipant")
def test_list_matches_filters_by_player(tmp_path):
  from fastapi import FastAPI
  from fastapi.testclient import TestClient
  from slowapi.errors import RateLimitExceeded
  from app import db
  from app.models import Player, Match, MatchParticipant, Sport
  from app.routers import matches, players, auth

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
              Stage.__table__,
              Match.__table__,
              MatchParticipant.__table__,
        MatchAuditLog.__table__,
          ],
      )

  asyncio.run(init_models())

  async def seed_sport():
    async with db.AsyncSessionLocal() as session:
      session.add(Sport(id="padel", name="Padel"))
      await session.commit()

  asyncio.run(seed_sport())

  app = FastAPI()
  app.state.limiter = auth.limiter
  app.add_exception_handler(RateLimitExceeded, auth.rate_limit_handler)
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
  os.environ["ADMIN_SECRET"] = "admintest"
  from fastapi import FastAPI
  from fastapi.testclient import TestClient
  from slowapi.errors import RateLimitExceeded
  from app import db
  from app.models import Match, ScoreEvent, User, Player, RefreshToken
  from app.routers import matches, auth

  db.engine = None
  db.AsyncSessionLocal = None
  engine = db.get_engine()

  async with engine.begin() as conn:
    await conn.run_sync(Match.__table__.create)
    await conn.run_sync(MatchAuditLog.__table__.create)
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
  app.state.limiter = auth.limiter
  app.add_exception_handler(RateLimitExceeded, auth.rate_limit_handler)
  app.include_router(auth.router)
  app.include_router(matches.router)
  client = TestClient(app)

  resp = client.delete(f"/matches/{mid}")
  assert resp.status_code == 401

  token_resp = client.post(
      "/auth/signup",
      json={"username": "admin", "password": "Str0ng!Pass!", "is_admin": True},
      headers={"X-Admin-Secret": "admintest"},
  )
  if token_resp.status_code != 200:
    token_resp = client.post(
        "/auth/login", json={"username": "admin", "password": "Str0ng!Pass!"}
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
  os.environ["ADMIN_SECRET"] = "admintest"
  from fastapi import FastAPI
  from fastapi.testclient import TestClient
  from slowapi.errors import RateLimitExceeded
  from app import db
  from app.models import Match, User, Player, RefreshToken
  from app.routers import matches, auth

  db.engine = None
  db.AsyncSessionLocal = None
  engine = db.get_engine()

  async with engine.begin() as conn:
    await conn.run_sync(Match.__table__.create)
    await conn.run_sync(MatchAuditLog.__table__.create)
    await conn.run_sync(User.__table__.create)
    await conn.run_sync(Player.__table__.create)
    await conn.run_sync(RefreshToken.__table__.create)

  app = FastAPI()
  app.state.limiter = auth.limiter
  app.add_exception_handler(RateLimitExceeded, auth.rate_limit_handler)
  app.include_router(auth.router)
  app.include_router(matches.router)
  with TestClient(app) as client:
    token_resp = client.post(
        "/auth/signup",
        json={"username": "admin", "password": "Str0ng!Pass!", "is_admin": True},
        headers={"X-Admin-Secret": "admintest"},
    )
    if token_resp.status_code != 200:
      token_resp = client.post(
          "/auth/login", json={"username": "admin", "password": "Str0ng!Pass!"}
      )
    token = token_resp.json()["access_token"]
    resp = client.delete(
        "/matches/unknown", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 404


@pytest.mark.anyio
async def test_delete_match_updates_ratings_and_leaderboard(tmp_path):
  from sqlalchemy.dialects.sqlite import JSON
  from app import db
  from app.models import (
      Player,
      Rating,
      GlickoRating,
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
            GlickoRating.__table__,
            Stage.__table__,
            Match.__table__,
            MatchAuditLog.__table__,
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
        playedAt=datetime(2024, 1, 1, tzinfo=timezone.utc),
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
        playedAt=datetime(2024, 1, 2, tzinfo=timezone.utc),
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


@pytest.mark.anyio
async def test_score_totals_influence_multi_side_rankings(tmp_path):
  from sqlalchemy.dialects.sqlite import JSON
  from app import db
  from app.models import (
      Sport,
      Player,
      Rating,
      GlickoRating,
      Stage,
      Match,
      MatchParticipant,
      ScoreEvent,
      User,
  )
  from app.schemas import MatchCreate, Participant
  from app.routers.matches import create_match

  db.engine = None
  db.AsyncSessionLocal = None
  engine = db.get_engine()

  MatchParticipant.__table__.columns["player_ids"].type = JSON()

  async with engine.begin() as conn:
    await conn.run_sync(
        db.Base.metadata.create_all,
        tables=[
            Sport.__table__,
            Player.__table__,
            Rating.__table__,
            GlickoRating.__table__,
            Stage.__table__,
            Match.__table__,
            MatchAuditLog.__table__,
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
            Sport(id="ffa", name="Free For All"),
            Player(id="p1", name="Alice"),
            Player(id="p2", name="Bob"),
            Player(id="p3", name="Carol"),
            Player(id="p4", name="Dave"),
        ]
    )
    await session.commit()

    admin = User(id="u1", username="admin", password_hash="", is_admin=True)

    body = MatchCreate(
        sport="ffa",
        participants=[
            Participant(side="A", playerIds=["p1"]),
            Participant(side="B", playerIds=["p2"]),
            Participant(side="C", playerIds=["p3"]),
            Participant(side="D", playerIds=["p4"]),
        ],
        score=[116, 92, 110, 58],
    )

    await create_match(body, session, user=admin)

    rating_rows = (
        await session.execute(
            select(Rating).where(Rating.sport_id == "ffa").order_by(Rating.player_id)
        )
    ).scalars().all()
    ratings = {row.player_id: row.value for row in rating_rows}

    assert ratings["p1"] > ratings["p3"] > ratings["p2"] > ratings["p4"]

    events = (
        await session.execute(
            select(ScoreEvent).where(ScoreEvent.type == "RATING").order_by(ScoreEvent.id)
        )
    ).scalars().all()
    assert {event.payload["playerId"] for event in events} == {"p1", "p2", "p3", "p4"}


@pytest.mark.anyio
async def test_create_match_rejects_naive_date(tmp_path):
  from fastapi import FastAPI
  from fastapi.testclient import TestClient
  from slowapi.errors import RateLimitExceeded
  from app import db
  from app.models import Sport, Match, User
  from app.routers import matches, auth
  from app.routers.auth import get_current_user

  db.engine = None
  db.AsyncSessionLocal = None
  engine = db.get_engine()
  async with engine.begin() as conn:
    await conn.run_sync(
        db.Base.metadata.create_all,
        tables=[
            Sport.__table__,
            Stage.__table__,
            Match.__table__,
            MatchAuditLog.__table__,
        ],
    )

  async with db.AsyncSessionLocal() as session:
    session.add(Sport(id="padel", name="Padel"))
    await session.commit()

  app = FastAPI()
  app.state.limiter = auth.limiter
  app.add_exception_handler(RateLimitExceeded, auth.rate_limit_handler)
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
    assert resp.status_code == 422
    detail = resp.json().get("detail")
    assert isinstance(detail, list)
    assert any("timezone offset" in str(item.get("msg")) for item in detail)


@pytest.mark.anyio
async def test_user_with_multiple_player_records_can_modify_match(tmp_path):
  from app import db
  from app.models import Match, MatchParticipant, Player, ScoreEvent, User
  from app.schemas import EventIn
  from app.routers import matches
  from app.scoring import padel

  db.engine = None
  db.AsyncSessionLocal = None
  engine = db.get_engine()
  async with engine.begin() as conn:
    await conn.run_sync(
        db.Base.metadata.create_all,
        tables=[
            Stage.__table__,
            Match.__table__,
            MatchParticipant.__table__,
        MatchAuditLog.__table__,
            ScoreEvent.__table__,
            Player.__table__,
        ],
    )

  async def dummy_broadcast(mid: str, message: dict) -> None:
    return None

  matches.broadcast = dummy_broadcast
  matches.importlib.import_module = lambda *args, **kwargs: padel

  async with db.AsyncSessionLocal() as session:
    user = User(id="u1", username="user", password_hash="", is_admin=False)
    session.add_all(
        [
            Player(id="p1", user_id="u1", name="P1"),
            Player(id="p2", user_id="u1", name="P2"),
            Match(id="m1", sport_id="padel"),
            MatchParticipant(id="mp1", match_id="m1", side="A", player_ids=["p1"]),
        ]
    )
    await session.commit()

    await matches.append_event("m1", EventIn(type="POINT", by="A"), session=session, user=user)
    events = (
        await session.execute(select(ScoreEvent).where(ScoreEvent.match_id == "m1"))
    ).scalars().all()
    assert len(events) == 1
    await matches.delete_match("m1", session=session, user=user)
    deleted_at = (
        await session.execute(select(Match.deleted_at).where(Match.id == "m1"))
    ).scalar_one()
    assert deleted_at is not None


@pytest.mark.anyio
async def test_create_match_writes_audit_log(tmp_path, monkeypatch):
  from app import db
  from app.models import Match, MatchParticipant, Player, ScoreEvent, Sport, User
  from app.routers import matches
  from app.schemas import MatchCreate, Participant

  db.engine = None
  db.AsyncSessionLocal = None
  engine = db.get_engine()
  async with engine.begin() as conn:
    await conn.run_sync(
      db.Base.metadata.create_all,
      tables=[
        Sport.__table__,
        Player.__table__,
        Stage.__table__,
        Match.__table__,
        MatchParticipant.__table__,
        ScoreEvent.__table__,
        MatchAuditLog.__table__,
      ],
    )

  async def noop(*args, **kwargs):  # type: ignore[no-untyped-def]
    return None

  monkeypatch.setattr(matches, "broadcast", noop)
  monkeypatch.setattr(matches, "notify_match_recorded", noop)
  monkeypatch.setattr(
    matches.player_stats_cache,
    "invalidate_players",
    noop,
  )

  async with db.AsyncSessionLocal() as session:
    session.add_all([
      Sport(id="padel", name="Padel"),
      Player(id="pa", name="Alice"),
      Player(id="pb", name="Bob"),
    ])
    await session.commit()

    body = MatchCreate(
      sport="padel",
      participants=[
        Participant(side="A", playerIds=["pa"]),
        Participant(side="B", playerIds=["pb"]),
      ],
      sets=[[6, 0], [6, 0]],
      isFriendly=True,
    )
    admin = User(id="admin", username="admin", password_hash="", is_admin=True)
    resp = await matches.create_match(body, session, user=admin)

    logs = (
      await session.execute(
        select(MatchAuditLog)
        .where(MatchAuditLog.match_id == resp.id)
        .order_by(MatchAuditLog.created_at)
      )
    ).scalars().all()
    assert [log.action for log in logs] == ["created"]
    assert logs[0].actor_user_id == admin.id
    assert logs[0].payload and logs[0].payload["payload"]["sport"] == "padel"


@pytest.mark.anyio
async def test_append_event_writes_audit_log(tmp_path, monkeypatch):
  from app import db
  from app.models import Match, MatchParticipant, Player, ScoreEvent, Sport, User
  from app.routers import matches
  from app.schemas import EventIn
  from app.scoring import padel as padel_engine

  db.engine = None
  db.AsyncSessionLocal = None
  engine = db.get_engine()
  async with engine.begin() as conn:
    await conn.run_sync(
      db.Base.metadata.create_all,
      tables=[
        Sport.__table__,
        Player.__table__,
        Stage.__table__,
        Match.__table__,
        MatchParticipant.__table__,
        ScoreEvent.__table__,
        MatchAuditLog.__table__,
      ],
    )

  async def noop(*args, **kwargs):  # type: ignore[no-untyped-def]
    return None

  monkeypatch.setattr(matches, "broadcast", noop)
  monkeypatch.setattr(
    matches.player_stats_cache,
    "invalidate_players",
    noop,
  )
  monkeypatch.setattr(matches.importlib, "import_module", lambda *args, **kwargs: padel_engine)

  async with db.AsyncSessionLocal() as session:
    session.add_all([
      Sport(id="padel", name="Padel"),
      Player(id="pa", name="Alice"),
      Player(id="pb", name="Bob"),
      Match(id="m1", sport_id="padel"),
      MatchParticipant(id="mpa", match_id="m1", side="A", player_ids=["pa"]),
      MatchParticipant(id="mpb", match_id="m1", side="B", player_ids=["pb"]),
    ])
    await session.commit()

    admin = User(id="admin", username="admin", password_hash="", is_admin=True)
    await matches.append_event(
      "m1",
      EventIn(type="POINT", by="A"),
      session=session,
      user=admin,
    )

    logs = (
      await session.execute(
        select(MatchAuditLog).where(
          MatchAuditLog.match_id == "m1",
          MatchAuditLog.action == "recorded",
        )
      )
    ).scalars().all()
    assert len(logs) == 1
    assert logs[0].actor_user_id == admin.id
    expected_event = {
      "type": "POINT",
      "by": "A",
      "pins": None,
      "side": None,
      "hole": None,
      "strokes": None,
    }
    assert logs[0].payload == {"event": expected_event}


@pytest.mark.anyio
async def test_delete_match_writes_audit_log(tmp_path, monkeypatch):
  from app import db
  from app.models import Match, MatchParticipant, Player, Rating, Sport, User
  from app.routers import matches

  db.engine = None
  db.AsyncSessionLocal = None
  engine = db.get_engine()
  async with engine.begin() as conn:
    await conn.run_sync(
      db.Base.metadata.create_all,
      tables=[
        Sport.__table__,
        Player.__table__,
        Stage.__table__,
        Match.__table__,
        MatchParticipant.__table__,
        Rating.__table__,
        MatchAuditLog.__table__,
      ],
    )

  async def noop(*args, **kwargs):  # type: ignore[no-untyped-def]
    return None

  monkeypatch.setattr(matches, "update_ratings", noop)
  monkeypatch.setattr(
    matches.player_stats_cache,
    "invalidate_players",
    noop,
  )

  async with db.AsyncSessionLocal() as session:
    session.add_all([
      Sport(id="padel", name="Padel"),
      Player(id="pa", name="Alice"),
      Player(id="pb", name="Bob"),
      Match(id="m1", sport_id="padel"),
      MatchParticipant(id="mpa", match_id="m1", side="A", player_ids=["pa"]),
      MatchParticipant(id="mpb", match_id="m1", side="B", player_ids=["pb"]),
    ])
    await session.commit()

    admin = User(id="admin", username="admin", password_hash="", is_admin=True)
    await matches.delete_match("m1", session=session, user=admin)

    logs = (
      await session.execute(
        select(MatchAuditLog).where(
          MatchAuditLog.match_id == "m1",
          MatchAuditLog.action == "deleted",
        )
      )
    ).scalars().all()
    assert len(logs) == 1
    assert logs[0].actor_user_id == admin.id
