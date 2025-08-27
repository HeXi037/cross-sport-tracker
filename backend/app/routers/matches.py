# backend/app/routers/matches.py
import uuid
import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import Match, MatchParticipant, ScoreEvent
from ..schemas import MatchCreate, EventIn

# Resource-only prefix; versioning is added in main.py
router = APIRouter(prefix="/matches", tags=["matches"])

# POST /api/v0/matches
@router.post("")
async def create_match(body: MatchCreate, session: AsyncSession = Depends(get_session)):
    mid = uuid.uuid4().hex
    match = Match(
        id=mid,
        sport_id=body.sport,
        ruleset_id=body.rulesetId,
        best_of=body.bestOf,
        details=None,   # <-- was metadata=None; we renamed the column to 'details'
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
    }

# POST /api/v0/matches/{mid}/events
@router.post("/{mid}/events")
async def append_event(mid: str, ev: EventIn, session: AsyncSession = Depends(get_session)):
    m = (await session.execute(select(Match).where(Match.id == mid))).scalar_one_or_none()
    if not m:
        raise HTTPException(404, "match not found")

    # For now just persist the event as-is; later we’ll validate via ruleset/scoring engine
    e = ScoreEvent(
        id=uuid.uuid4().hex,
        match_id=mid,
        type=ev.type,
        payload=json.loads(ev.model_dump_json()),
    )
    session.add(e)
    await session.commit()
    return {"ok": True, "eventId": e.id}
