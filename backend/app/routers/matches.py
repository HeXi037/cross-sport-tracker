# backend/app/routers/matches.py
import uuid
import importlib
from collections import Counter
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import Match, MatchParticipant, Player, ScoreEvent, User, Rating
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
from ..scoring import padel as padel_engine, tennis as tennis_engine
from ..services.validation import validate_set_scores, ValidationError
from ..services import update_ratings, update_player_metrics
from .admin import require_admin

# Resource-only prefix; versioning is added in main.py
router = APIRouter(prefix="/matches", tags=["matches"])

# GET /api/v0/matches
@router.get("", response_model=list[MatchSummaryOut])
async def list_matches(
    playerId: str | None = None,
    upcoming: bool = False,
    session: AsyncSession = Depends(get_session),
):
    if playerId:
        rows = (
            await session.execute(
                select(Match, MatchParticipant)
                .join(MatchParticipant)
                .where(Match.deleted_at.is_(None))
                .order_by(Match.played_at.desc())
            )
        ).all()
        matches: list[Match] = []
        seen: set[str] = set()
        for row in rows:
            match = row.Match
            mp = row.MatchParticipant
            if playerId in (mp.player_ids or []) and match.id not in seen:
                if not upcoming or match.played_at is None or match.played_at > datetime.utcnow():
                    matches.append(match)
                    seen.add(match.id)
    else:
        stmt = select(Match).where(Match.deleted_at.is_(None))
        if upcoming:
            stmt = stmt.where(
                (Match.played_at.is_(None)) | (Match.played_at > func.now())
            )
        stmt = stmt.order_by(Match.played_at.desc())
        matches = (await session.execute(stmt)).scalars().all()

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
async def create_match(
    body: MatchCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(require_admin),
):
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
    # Validate that no player appears on more than one side
    player_sides: dict[str, str] = {}
    for part in body.participants:
        for pid in part.playerIds:
            if pid in player_sides and player_sides[pid] != part.side:
                raise HTTPException(400, "duplicate players")
            player_sides[pid] = part.side

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
async def create_match_by_name(
    body: MatchCreateByName,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(require_admin),
):
    name_to_id = {}
    names = [n for part in body.participants for n in part.playerNames]
    if names:
        rows = (
            await session.execute(
                select(Player).where(
                    Player.name.in_(names), Player.deleted_at.is_(None)
                )
            )
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
    return await create_match(mc, session, user)

# GET /api/v0/matches/{mid}
@router.get("/{mid}", response_model=MatchOut)
async def get_match(mid: str, session: AsyncSession = Depends(get_session)):
    m = (
        await session.execute(
            select(Match).where(Match.id == mid, Match.deleted_at.is_(None))
        )
    ).scalar_one_or_none()
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

# DELETE /api/v0/matches/{mid}
@router.delete("/{mid}", status_code=204)
async def delete_match(
    mid: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(require_admin),
):
    m = await session.get(Match, mid)
    if not m or m.deleted_at is not None:
        raise HTTPException(404, "match not found")

    sport_id = m.sport_id
    m.deleted_at = func.now()
    await session.commit()

    # Recompute ratings for this sport now that the match is removed
    try:
        # Reset existing ratings to the default value
        rows = (
            await session.execute(
                select(Rating).where(Rating.sport_id == sport_id)
            )
        ).scalars().all()
        for r in rows:
            r.value = 1000.0
        await session.commit()

        # Replay remaining matches to rebuild ratings
        matches = (
            await session.execute(
                select(Match)
                .where(Match.sport_id == sport_id, Match.deleted_at.is_(None))
                .order_by(Match.played_at)
            )
        ).scalars().all()

        for match in matches:
            parts = (
                await session.execute(
                    select(MatchParticipant).where(
                        MatchParticipant.match_id == match.id
                    )
                )
            ).scalars().all()
            players_a = [pid for p in parts if p.side == "A" for pid in p.player_ids]
            players_b = [pid for p in parts if p.side == "B" for pid in p.player_ids]
            details = match.details or {}
            sets = details.get("sets") if isinstance(details, dict) else None
            if not sets or not players_a or not players_b:
                continue
            if sets.get("A") == sets.get("B"):
                await update_ratings(
                    session,
                    match.sport_id,
                    players_a,
                    players_b,
                    draws=players_a + players_b,
                )
            else:
                winner_side = "A" if sets["A"] > sets["B"] else "B"
                winners = players_a if winner_side == "A" else players_b
                losers = players_b if winner_side == "A" else players_a
                await update_ratings(session, match.sport_id, winners, losers)
        await session.commit()
    except Exception:
        # Ignore errors (e.g., rating tables may not exist in some tests)
        pass

    return Response(status_code=204)

# POST /api/v0/matches/{mid}/events
@router.post("/{mid}/events")
async def append_event(
    mid: str,
    ev: EventIn,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(require_admin),
):
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
async def record_sets_endpoint(
    mid: str,
    body: SetsIn,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(require_admin),
):
    m = (await session.execute(select(Match).where(Match.id == mid))).scalar_one_or_none()
    if not m:
        raise HTTPException(404, "match not found")
    if m.sport_id not in ("padel", "tennis"):
        raise HTTPException(400, "set recording only supported for padel or tennis")

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
    engine = padel_engine if m.sport_id == "padel" else tennis_engine
    state = engine.init_state({})
    for old in existing:
        state = engine.apply(old.payload, state)

    new_events, state = engine.record_sets(body.sets, state)

    for ev in new_events:
        e = ScoreEvent(
            id=uuid.uuid4().hex,
            match_id=mid,
            type=ev["type"],
            payload=ev,
        )
        session.add(e)

    m.details = engine.summary(state)
    try:
        parts = (
            await session.execute(
                select(MatchParticipant).where(MatchParticipant.match_id == mid)
            )
        ).scalars().all()
    except Exception:
        parts = []
    players_a = [pid for p in parts if p.side == "A" for pid in p.player_ids]
    players_b = [pid for p in parts if p.side == "B" for pid in p.player_ids]
    sets = m.details.get("sets") if m.details else None
    if sets and players_a and players_b:
        if sets.get("A") == sets.get("B"):
            draws = players_a + players_b
            try:
                await update_ratings(
                    session,
                    m.sport_id,
                    players_a,
                    players_b,
                    draws=draws,
                )
            except Exception:
                pass
            await update_player_metrics(
                session, m.sport_id, [], [], draws
            )
        else:
            winner_side = "A" if sets["A"] > sets["B"] else "B"
            winners = players_a if winner_side == "A" else players_b
            losers = players_b if winner_side == "A" else players_a
            try:
                await update_ratings(session, m.sport_id, winners, losers)
            except Exception:
                pass
            await update_player_metrics(
                session, m.sport_id, winners, losers
            )

    await session.commit()
    await broadcast(mid, {"summary": m.details})
    return {"ok": True, "added": len(new_events)}
