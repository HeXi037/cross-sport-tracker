# backend/app/routers/matches.py
import uuid
import importlib
from collections import Counter
from datetime import datetime
from typing import Any, Sequence

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..cache import player_stats_cache
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
from .auth import get_current_user

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
                .order_by(Match.played_at.desc().nullsfirst())
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
        stmt = stmt.order_by(Match.played_at.desc().nullsfirst())
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
    user: User = Depends(get_current_user),
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

    player_sides: dict[str, str] = {}
    side_players: dict[str, list[str]] = {}
    all_player_ids: list[str] = []
    for part in body.participants:
        for pid in part.playerIds:
            if pid in player_sides and player_sides[pid] != part.side:
                raise HTTPException(400, "duplicate players")
            player_sides[pid] = part.side
            all_player_ids.append(pid)
            side_players.setdefault(part.side, []).append(pid)

    if not user.is_admin:
        player_ids = (
            await session.execute(select(Player.id).where(Player.user_id == user.id))
        ).scalars().all()
        if not player_ids or not any(pid in all_player_ids for pid in player_ids):
            raise HTTPException(status_code=403, detail="forbidden")

    for part in body.participants:
        mp = MatchParticipant(
            id=uuid.uuid4().hex,
            match_id=mid,
            side=part.side,
            player_ids=part.playerIds,
        )
        session.add(mp)

    extra_details = dict(body.details) if body.details else None

    if match.sport_id == "bowling" and isinstance(extra_details, dict):
        players = extra_details.get("players")
        if isinstance(players, list):
            normalized_players: list[Any] = []
            players_updated = False
            for player in players:
                if not isinstance(player, dict):
                    normalized_players.append(player)
                    continue
                player_payload = dict(player)
                if "scores" not in player_payload and "frameScores" in player_payload:
                    player_payload["scores"] = player_payload["frameScores"]
                    players_updated = True
                normalized_players.append(player_payload)
            if players_updated:
                extra_details = dict(extra_details)
                extra_details["players"] = normalized_players
    summary: dict[str, Any] | None = None
    set_pairs: list[tuple[int, int]] = []
    score_events: list[dict[str, Any]] = []

    if body.sets:
        normalized_sets: list[dict[str, int]] = []
        try:
            # ``MatchCreate.sets`` may be provided either as a list of per-set
            # pairs (e.g. ``[[6, 4], [5, 7]]``) or transposed by side (e.g.
            # ``[[6, 5], [4, 7]]``). Accept both formats.
            candidate_pairs: list[Sequence[int]]
            if all(isinstance(s, (list, tuple)) and len(s) == 2 for s in body.sets):
                candidate_pairs = [tuple(s) for s in body.sets]  # type: ignore[arg-type]
            else:
                transposed = list(zip(*body.sets))
                if not transposed:
                    raise ValidationError("At least one set is required.")
                candidate_pairs = [tuple(scores) for scores in transposed]
            if any(len(pair) != 2 for pair in candidate_pairs):
                raise ValidationError("Set scores must include values for sides A and B.")
            for pair in candidate_pairs:
                normalized_sets.append({"A": pair[0], "B": pair[1]})
            is_racket_sport = match.sport_id in ("padel", "tennis")
            max_sets = match.best_of if match.best_of else (5 if is_racket_sport else None)
            validate_set_scores(
                normalized_sets,
                max_sets=max_sets,
                allow_ties=not is_racket_sport,
            )
        except ValidationError as e:
            raise HTTPException(status_code=422, detail=str(e))
        except Exception:
            raise HTTPException(status_code=422, detail="Invalid set scores provided.")

        set_pairs = [(int(s["A"]), int(s["B"])) for s in normalized_sets]
        config: dict[str, Any] = {}
        if match.best_of:
            config["sets"] = match.best_of

        if match.sport_id in ("padel", "tennis"):
            engine = padel_engine if match.sport_id == "padel" else tennis_engine
            state = engine.init_state(config)
            score_events, state = engine.record_sets(set_pairs, state)
            summary = engine.summary(state)
        else:
            summary = {
                "sets": {
                    "A": sum(1 for a, b in set_pairs if a > b),
                    "B": sum(1 for a, b in set_pairs if b > a),
                },
                "set_scores": [{"A": a, "B": b} for a, b in set_pairs],
            }
            if config:
                summary["config"] = config

        if summary is not None:
            set_scores_obj = summary.get("set_scores") if isinstance(summary, dict) else None
            if not isinstance(set_scores_obj, list) or not set_scores_obj:
                summary["set_scores"] = [{"A": a, "B": b} for a, b in set_pairs]
                set_scores_obj = summary["set_scores"]
            totals = {
                "A": sum(int((s or {}).get("A", 0)) for s in set_scores_obj),
                "B": sum(int((s or {}).get("B", 0)) for s in set_scores_obj),
            }
            summary["score"] = totals

    details_payload: dict[str, Any] = dict(extra_details or {})

    if summary is not None:
        details_payload.update(summary)
    elif body.score:
        score_detail = {"score": {chr(65 + i): s for i, s in enumerate(body.score)}}
        details_payload.update(score_detail)

    if details_payload:
        match.details = details_payload

    for payload in score_events:
        e = ScoreEvent(
            id=uuid.uuid4().hex,
            match_id=mid,
            type=payload.get("type", "POINT"),
            payload=payload,
        )
        session.add(e)

    players_a = side_players.get("A", [])
    players_b = side_players.get("B", [])
    if summary and players_a and players_b:
        sets_record = summary.get("sets") if isinstance(summary, dict) else None
        try:
            a_sets = int(sets_record.get("A")) if sets_record else None
            b_sets = int(sets_record.get("B")) if sets_record else None
        except (TypeError, ValueError):
            a_sets = b_sets = None

        if a_sets is not None and b_sets is not None:
            if a_sets == b_sets:
                draws = players_a + players_b
                try:
                    await update_ratings(
                        session,
                        match.sport_id,
                        players_a,
                        players_b,
                        draws=draws,
                        match_id=mid,
                    )
                except Exception:
                    pass
                await update_player_metrics(session, match.sport_id, [], [], draws)
            else:
                winner_side = "A" if a_sets > b_sets else "B"
                winners = players_a if winner_side == "A" else players_b
                losers = players_b if winner_side == "A" else players_a
                try:
                    await update_ratings(
                        session, match.sport_id, winners, losers, match_id=mid
                    )
                except Exception:
                    pass
                await update_player_metrics(session, match.sport_id, winners, losers)

    await session.commit()
    await player_stats_cache.invalidate_players(all_player_ids)
    if summary is not None:
        await broadcast(mid, {"summary": match.details})
    return MatchIdOut(id=mid)


@router.post("/by-name", response_model=MatchIdOut)
async def create_match_by_name(
    body: MatchCreateByName,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    name_to_id: dict[str, str] = {}
    original_names = [n for part in body.participants for n in part.playerNames]
    lookup_names = [n.lower() for n in original_names]
    if lookup_names:
        rows = (
            await session.execute(
                select(Player).where(
                    Player.name.in_(lookup_names), Player.deleted_at.is_(None)
                )
            )
        ).scalars().all()
        # Player names are stored normalized (lowercase)
        name_to_id = {p.name: p.id for p in rows}
    missing = [n for n in original_names if n.lower() not in name_to_id]
    if missing:
        raise HTTPException(400, f"unknown players: {', '.join(missing)}")
    id_to_name = {pid: name for name, pid in name_to_id.items()}
    dup_ids = [
        pid
        for pid, cnt in Counter(name_to_id[n.lower()] for n in original_names).items()
        if cnt > 1
    ]
    if dup_ids:
        dups = [id_to_name[pid] for pid in dup_ids]
        raise HTTPException(400, f"duplicate players: {', '.join(dups)}")
    parts = []
    for part in body.participants:
        ids = [name_to_id[n.lower()] for n in part.playerNames]
        parts.append(Participant(side=part.side, playerIds=ids))
    sets = None
    if body.sets:
        sets = [list(scores) for scores in zip(*body.sets)]
    mc = MatchCreate(
        sport=body.sport,
        rulesetId=body.rulesetId,
        participants=parts,
        bestOf=body.bestOf,
        playedAt=body.playedAt,
        location=body.location,
        sets=sets,
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
    user: User = Depends(get_current_user),
):
    m = await session.get(Match, mid)
    if not m or m.deleted_at is not None:
        raise HTTPException(404, "match not found")

    try:
        parts = (
            await session.execute(
                select(MatchParticipant).where(MatchParticipant.match_id == mid)
            )
        ).scalars().all()
    except Exception:
        parts = []
    match_player_ids = {pid for p in parts for pid in (p.player_ids or [])}
    if not user.is_admin:
        user_player_ids = (
            await session.execute(select(Player.id).where(Player.user_id == user.id))
        ).scalars().all()
        if not user_player_ids or not set(user_player_ids) & match_player_ids:
            raise HTTPException(status_code=403, detail="forbidden")

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
                    match_id=match.id,
                )
            else:
                winner_side = "A" if sets["A"] > sets["B"] else "B"
                winners = players_a if winner_side == "A" else players_b
                losers = players_b if winner_side == "A" else players_a
                await update_ratings(
                    session, match.sport_id, winners, losers, match_id=match.id
                )
        await session.commit()
    except Exception:
        # Ignore errors (e.g., rating tables may not exist in some tests)
        pass

    await player_stats_cache.invalidate_players(match_player_ids)
    return Response(status_code=204)

# POST /api/v0/matches/{mid}/events
@router.post("/{mid}/events")
async def append_event(
    mid: str,
    ev: EventIn,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    m = (await session.execute(select(Match).where(Match.id == mid))).scalar_one_or_none()
    if not m:
        raise HTTPException(404, "match not found")

    parts = (
        await session.execute(
            select(MatchParticipant).where(MatchParticipant.match_id == mid)
        )
    ).scalars().all()
    match_player_ids = {pid for p in parts for pid in (p.player_ids or [])}
    if not user.is_admin:
        user_player_ids = (
            await session.execute(select(Player.id).where(Player.user_id == user.id))
        ).scalars().all()
        if not user_player_ids or not set(user_player_ids) & match_player_ids:
            raise HTTPException(status_code=403, detail="forbidden")

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
    await player_stats_cache.invalidate_players(match_player_ids)
    await broadcast(mid, {"event": e.payload, "summary": m.details})
    return {"ok": True, "eventId": e.id}


@router.post("/{mid}/sets")
async def record_sets_endpoint(
    mid: str,
    body: SetsIn,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    m = (await session.execute(select(Match).where(Match.id == mid))).scalar_one_or_none()
    if not m:
        raise HTTPException(404, "match not found")
    if m.sport_id not in ("padel", "tennis"):
        raise HTTPException(400, "set recording only supported for padel or tennis")

    try:
        parts = (
            await session.execute(
                select(MatchParticipant).where(MatchParticipant.match_id == mid)
            )
        ).scalars().all()
    except Exception:
        parts = []
    if not user.is_admin:
        user_player_ids = (
            await session.execute(select(Player.id).where(Player.user_id == user.id))
        ).scalars().all()
        match_player_ids = {pid for p in parts for pid in (p.player_ids or [])}
        if not user_player_ids or not set(user_player_ids) & match_player_ids:
            raise HTTPException(status_code=403, detail="forbidden")

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
        set_tuples = [(int(s["A"]), int(s["B"])) for s in normalized_sets]
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

    new_events, state = engine.record_sets(set_tuples, state)

    for ev in new_events:
        e = ScoreEvent(
            id=uuid.uuid4().hex,
            match_id=mid,
            type=ev["type"],
            payload=ev,
        )
        session.add(e)

    m.details = engine.summary(state)
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
                    match_id=mid,
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
                await update_ratings(
                    session, m.sport_id, winners, losers, match_id=mid
                )
            except Exception:
                pass
            await update_player_metrics(
                session, m.sport_id, winners, losers
            )

    await session.commit()
    await player_stats_cache.invalidate_players(players_a + players_b)
    await broadcast(mid, {"summary": m.details})
    return {"ok": True, "added": len(new_events)}
