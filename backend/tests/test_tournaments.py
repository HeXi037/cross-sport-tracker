import os
import sys
from collections import Counter
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


@pytest.mark.anyio
async def test_schedule_americano_balances_odd_roster():
    from sqlalchemy import select

    from app import db
    from app.models import (
        Match,
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
        MatchParticipant,
        ScoreEvent,
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
                MatchParticipant.__table__,
                ScoreEvent.__table__,
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

    app = FastAPI()
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
