# backend/app/routers/matches.py
import uuid
import json
import importlib
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import Match, MatchParticipant, ScoreEvent
from ..schemas import MatchCreate, EventIn
from .streams import broadcast

# Resource-only prefix; versioning is added in main.py
router = APIRouter(prefix="/matches", tags=["matches"])

# GET /api/v0/matches
@router.get("")
async def list_matches(session: AsyncSession = Depends(get_session)):
    matches = (await session.execute(select(Match))).scalars().all()
    return [
        {"id": m.id, "sport": m.sport_id, "bestOf": m.best_of}
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
