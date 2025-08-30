# backend/app/routers/matches.py
import uuid
import importlib
from collections import Counter
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import Match, MatchParticipant, Player, ScoreEvent
from ..schemas import (
    MatchCreate,
    MatchCreateByName,
    Participant,
    EventIn,
    SetsIn,
    MatchIdOut,
    MatchSummaryOut,
    MatchOut,
    ParticipantOut,
    ScoreEventOut,
)
from .streams import broadcast
from ..scoring import padel as padel_engine
from ..services.validation import validate_set_scores, ValidationError

# Resource-only prefix; versioning is added in main.py
router = APIRouter(prefix="/matches", tags=["matches"])

# GET /api/v0/matches
@router.get("", response_model=list[MatchSummaryOut])
async def list_matches(session: AsyncSession = Depends(get_session)):
    matches = (await session.execute(select(Match))).scalars().all()
    return [
        MatchSummaryOut(
            id=m.id,
            sport=m.sport_id,
            bestOf=m.best_of,
            playedAt=m.played_at,
            location=m.location,
        )
        for m in matches
    ]

# POST /api/v0/matches
@router.post("", response_model=MatchIdOut)
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
    return MatchIdOut(id=mid)


@router.post("/by-name", response_model=MatchIdOut)
async def create_match_by_name(body: MatchCreateByName, session: AsyncSession = Depends(get_session)):
    name_to_id = {}
    names = [n for part in body.participants for n in part.playerNames]
    if names:
        rows = (
            await session.execute(select(Player).where(Player.name.in_(names)))
        ).scalars().all()
        name_to_id = {p.name: p.id for p in rows}
    missing = [n for n in names if n not in name_to_id]
    if missing:
        raise HTTPException(400, f"unknown players: {', '.join(missing)}")
    id_to_name = {pid: name for name, pid in name_to_id.items()}
    dup_ids = [pid for pid, cnt in Counter(name_to_id[n] for n in names).items() if cnt > 1]
    if dup_ids:
        dups = [id_to_name[pid] for pid in dup_ids]
        raise HTTPException(400, f"duplicate players: {', '.join(dups)}")
    parts = []
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
@router.get("/{mid}", response_model=MatchOut)
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

    return MatchOut(
        id=m.id,
        sport=m.sport_id,
        rulesetId=m.ruleset_id,
        bestOf=m.best_of,
        playedAt=m.played_at,
        location=m.location,
        participants=[
            ParticipantOut(id=p.id, side=p.side, playerIds=p.player_ids) for p in parts
        ],
        events=[
            ScoreEventOut(
                id=e.id,
                type=e.type,
                payload=e.payload,
                createdAt=e.created_at,
            )
            for e in events
        ],
        summary=m.details,
    )

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

    payload = ev.model_dump()
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


@router.post("/{mid}/sets")
async def record_sets_endpoint(mid: str, body: SetsIn, session: AsyncSession = Depends(get_session)):
    m = (await session.execute(select(Match).where(Match.id == mid))).scalar_one_or_none()
    if not m:
        raise HTTPException(404, "match not found")
    if m.sport_id != "padel":
        raise HTTPException(400, "set recording only supported for padel")

    # Validate set scores before applying them.
    # Normalize Pydantic models, dicts, or 2-item tuples into list[dict] for the validator.
    try:
        normalized_sets = []
        for s in body.sets:
            if isinstance(s, dict):
                normalized_sets.append({"A": s.get("A"), "B": s.get("B")})
            elif isinstance(s, (list, tuple)) and len(s) == 2:
                normalized_sets.append({"A": s[0], "B": s[1]})
            else:
                normalized_sets.append({"A": getattr(s, "A", None), "B": getattr(s, "B", None)})
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
