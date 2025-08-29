# backend/app/routers/matches.py
import uuid
import json
import importlib
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import Match, MatchParticipant, Player, ScoreEvent
from ..schemas import MatchCreate, MatchCreateByName, Participant, EventIn, SetsIn
from .streams import broadcast
from ..scoring import padel as padel_engine
from ..services.validation import validate_set_scores, ValidationError

# Resource-only prefix; versioning is added in main.py
router = APIRouter(prefix="/matches", tags=["matches"])


# GET /api/v0/matches
@router.get("")
async def list_matches(session: AsyncSession = Depends(get_session)):
    matches = (await session.execute(select(Match))).scalars().all()
    return [
        {
            "id": m.id,
            "sport": m.sport_id,
            "bestOf": m.best_of,
            "playedAt": m.played_at.isoformat() if m.played_at else None,
            "location": m.location,
        }
        for m in matches
    ]


# POST /api/v0/matches
@router.post("")
async def create_match(body: MatchCreate, session: AsyncSession = Depends(get_session)):
    mid = uuid.uuid4().hex
    match = Match(
        id=mid,
        sport_id=body.sport,
        ruleset_id=body.rulesetId,
        best_of=body.bestOf,
        played_at=body.playedAt,
        location=body.location,
        details=None,
    )
    session.add(match)

    for part in body.participants:
        mp = MatchParticipant(
            id=uuid.uuid4().hex,
            match_id=mid,
            side=part.side,
            player_ids=part.playerIds,
        )
        session.add(mp)

    await session.commit()
    return {"id": mid}


# POST /api/v0/matches/by-name
@router.post("/by-name")
async def create_match_by_name(body: MatchCreateByName, session: AsyncSession = Depends(get_session)):
    name_to_id: dict[str, str] = {}
    names = [n for part in body.participants for n in part.playerNames]
    if names:
        rows = (await session.execute(select(Player).where(Player.name.in_(names)))).scalars().all()
        name_to_id = {p.name: p.id for p in rows}

    missing = [n for n in names if n not in name_to_id]
    if missing:
        if not body.createMissing:
            raise HTTPException(400, f"unknown players: {', '.join(missing)}")
        # Create missing players (assumes name uniqueness at DB level)
        for n in missing:
            session.add(Player(id=uuid.uuid4().hex, name=n))
        await session.commit()
        # Refresh mapping
        rows = (await session.execute(select(Player).where(Player.name.in_(names)))).scalars().all()
        name_to_id = {p.name: p.id for p in rows}

    parts: list[Participant] = []
    for part in body.participants:
        ids = [name_to_id[n] for n in part.playerNames]
        parts.append(Participant(side=part.side, playerIds=ids))

    mc = MatchCreate(
        sport=body.sport,
        rulesetId=body.rulesetId,
        participants=parts,
        bestOf=body.bestOf,
        playedAt=body.playedAt,
        location=body.location,
    )
    return await create_match(mc, session)


# GET /api/v0/matches/{mid}
@router.get("/{mid}")
async def get_match(mid: str, session: AsyncSession = Depends(get_session)):
    m = (await session.execute(select(Match).where(Match.id == mid))).scalar_one_or_none()
    if not m:
        raise HTTPException(404, "match not found")

    parts = (
        await session.execute(select(MatchParticipant).where(MatchParticipant.match_id == mid))
    ).scalars().all()

    events = (
        await session.execute(
            select(ScoreEvent).where(ScoreEvent.match_id == mid).order_by(ScoreEvent.created_at)
        )
    ).scalars().all()

    return {
        "id": m.id,
        "sport": m.sport_id,
        "rulesetId": m.ruleset_id,
        "bestOf": m.best_of,
        "playedAt": m.played_at.isoformat() if m.played_at else None,
        "location": m.location,
        "participants": [{"id": p.id, "side": p.side, "playerIds": p.player_ids} for p in parts],
        "events": [
            {"id": e.id, "type": e.type, "payload": e.payload, "createdAt": e.created_at.isoformat()}
            for e in events
        ],
        "summary": m.details,
    }


# POST /api/v0/matches/{mid}/events
@router.post("/{mid}/events")
async def append_event(mid: str, ev: EventIn, session: AsyncSession = Depends(get_session)):
    m = (await session.execute(select(Match).where(Match.id == mid))).scalar_one_or_none()
    if not m:
        raise HTTPException(404, "match not found")

    try:
        engine = importlib.import_module(f"..scoring.{m.sport_id}", package="backend.app")
    except ModuleNotFoundError:
        raise HTTPException(400, "unknown sport")

    existing = (
        await session.execute(
            select(ScoreEvent).where(ScoreEvent.match_id == mid).order_by(ScoreEvent.created_at)
        )
    ).scalars().all()

    state = engine.init_state({})
    for old in existing:
        state = engine.apply(old.payload, state)

    payload = json.loads(ev.model_dump_json())
    try:
        state = engine.apply(payload, state)
    except ValueError as exc:
        raise HTTPException(400, str(exc))

    e = ScoreEvent(
        id=uuid.uuid4().hex,
        match_id=mid,
        type=ev.type,
        payload=payload,
    )
    session.add(e)
    m.details = engine.summary(state)
    await session.commit()
    await broadcast(mid, {"event": e.payload, "summary": m.details})
    return {"ok": True, "eventId": e.id}


# POST /api/v0/matches/{mid}/sets
@router.post("/{mid}/sets")
async def record_sets_endpoint(mid: str, body: SetsIn, session: AsyncSession = Depends(get_session)):
    m = (await session.execute(select(Match).where(Match.id == mid))).scalar_one_or_none()
    if not m:
        raise HTTPException(404, "match not found")
    if m.sport_id != "padel":
        raise HTTPException(400, "set recording only supported for padel")

    # Normalize tuple-style sets to dicts so our validator (which expects A/B keys) is satisfied.
    # SetsIn guarantees each item is a 2-tuple[int, int].
    normalized_sets = [{"A": s[0], "B": s[1]} for s in body.sets]
    try:
        validate_set_scores(normalized_sets)
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=str(e))

    existing = (
        await session.execute(
            select(ScoreEvent).where(ScoreEvent.match_id == mid).order_by(ScoreEvent.created_at)
        )
    ).scalars().all()

    state = padel_engine.init_state({})
    for old in existing:
        state = padel_engine.apply(old.payload, state)

    new_events, state = padel_engine.record_sets(body.sets, state)

    for ev in new_events:
        e = ScoreEvent(
            id=uuid.uuid4().hex,
            match_id=mid,
            type=ev["type"],
            payload=ev,
        )
        session.add(e)

    m.details = padel_engine.summary(state)
    await session.commit()
    await broadcast(mid, {"summary": m.details})
    return {"ok": True, "added": len(new_events)}
