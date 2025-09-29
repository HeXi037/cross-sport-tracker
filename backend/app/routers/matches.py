# backend/app/routers/matches.py
import uuid
import importlib
from collections import Counter
from datetime import datetime
from typing import Any, Sequence

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..cache import player_stats_cache
from ..models import (
    Match,
    MatchParticipant,
    Player,
    ScoreEvent,
    Stage,
    User,
    Rating,
)
from ..schemas import (
    MatchCreate,
    MatchCreateByName,
    Participant,
    EventIn,
    SetsIn,
    MatchIdOut,
    MatchSummaryOut,
    MatchSummaryParticipantOut,
    PlayerNameOut,
    MatchOut,
    ParticipantOut,
    ScoreEventOut,
)
from .streams import broadcast
from ..scoring import padel as padel_engine, tennis as tennis_engine
from ..services.validation import validate_set_scores, ValidationError
from ..services import (
    update_ratings,
    update_player_metrics,
    recompute_stage_standings,
)
from ..exceptions import http_problem
from .auth import get_current_user
from ..time_utils import coerce_utc

# Resource-only prefix; versioning is added in main.py
router = APIRouter(prefix="/matches", tags=["matches"])


def _coerce_utc(value: datetime | None) -> datetime | None:
    return coerce_utc(value)


AMERICANO_STAGE_TYPE = "americano"
AMERICANO_RATING_SUFFIX = "_americano"


def _rating_sport_id_for_stage(sport_id: str, stage: Stage | None) -> str:
    if stage and stage.type == AMERICANO_STAGE_TYPE:
        return f"{sport_id}{AMERICANO_RATING_SUFFIX}"
    return sport_id


async def _get_match_stage(session: AsyncSession, match: Match) -> Stage | None:
    if not match.stage_id:
        return None
    return await session.get(Stage, match.stage_id)

# GET /api/v0/matches
@router.get("", response_model=list[MatchSummaryOut])
async def list_matches(
    response: Response,
    playerId: str | None = None,
    stageId: str | None = None,
    upcoming: bool = False,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_session),
):
    base_stmt = select(Match).where(Match.deleted_at.is_(None))

    if upcoming:
        base_stmt = base_stmt.where(
            (Match.played_at.is_(None)) | (Match.played_at > func.now())
        )

    if stageId:
        base_stmt = base_stmt.where(Match.stage_id == stageId)

    if playerId:
        participant_matches = select(MatchParticipant.match_id).where(
            MatchParticipant.player_ids.contains([playerId])
        )
        base_stmt = base_stmt.where(Match.id.in_(participant_matches))

    stmt = base_stmt.order_by(Match.played_at.desc().nullsfirst())
    stmt = stmt.offset(offset).limit(limit + 1)

    result = (await session.execute(stmt)).scalars().all()

    has_more = len(result) > limit
    matches = result[:limit]
    next_offset = offset + limit if has_more else None

    match_ids = [m.id for m in matches]
    participants_by_match: dict[str, list[MatchParticipant]] = {
        mid: [] for mid in match_ids
    }
    player_ids: set[str] = set()

    if match_ids:
        participant_rows = (
            await session.execute(
                select(MatchParticipant).where(MatchParticipant.match_id.in_(match_ids))
            )
        ).scalars().all()
        for participant in participant_rows:
            participants_by_match.setdefault(participant.match_id, []).append(participant)
            for pid in participant.player_ids or []:
                if pid:
                    player_ids.add(pid)

    players_by_id: dict[str, Player] = {}
    if player_ids:
        player_rows = (
            await session.execute(select(Player).where(Player.id.in_(player_ids)))
        ).scalars().all()
        players_by_id = {player.id: player for player in player_rows}

    def _player_payload(pid: str) -> PlayerNameOut:
        player = players_by_id.get(pid)
        if not player:
            return PlayerNameOut(id=pid, name="Unknown", photo_url=None)
        name = player.name or "Unknown"
        photo_url = getattr(player, "photo_url", None)
        return PlayerNameOut(id=pid, name=name, photo_url=photo_url)

    response.headers["X-Limit"] = str(limit)
    response.headers["X-Offset"] = str(offset)
    response.headers["X-Has-More"] = "true" if has_more else "false"
    if next_offset is not None:
        response.headers["X-Next-Offset"] = str(next_offset)

    return [
        MatchSummaryOut(
            id=m.id,
            sport=m.sport_id,
            stageId=m.stage_id,
            bestOf=m.best_of,
            playedAt=_coerce_utc(m.played_at),
            location=m.location,
            isFriendly=m.is_friendly,
            participants=[
                MatchSummaryParticipantOut(
                    id=p.id,
                    side=p.side,
                    playerIds=p.player_ids,
                    players=[_player_payload(pid) for pid in p.player_ids or []],
                )
                for p in sorted(
                    participants_by_match.get(m.id, []),
                    key=lambda part: part.side,
                )
            ],
            summary=m.details,
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
        is_friendly=body.isFriendly,
    )
    session.add(match)

    player_sides: dict[str, str] = {}
    side_players: dict[str, list[str]] = {}
    all_player_ids: list[str] = []
    for part in body.participants:
        for pid in part.playerIds:
            if pid in player_sides and player_sides[pid] != part.side:
                raise http_problem(
                    status_code=400,
                    detail="duplicate players",
                    code="match_duplicate_players",
                )
            player_sides[pid] = part.side
            all_player_ids.append(pid)
            side_players.setdefault(part.side, []).append(pid)

    if not user.is_admin:
        player_ids = (
            await session.execute(select(Player.id).where(Player.user_id == user.id))
        ).scalars().all()
        if not player_ids or not any(pid in all_player_ids for pid in player_ids):
            raise http_problem(
                status_code=403,
                detail="forbidden",
                code="match_forbidden",
            )

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
            raise http_problem(
                status_code=422,
                detail=str(e),
                code="match_validation_error",
            )
        except Exception:
            raise http_problem(
                status_code=422,
                detail="Invalid set scores provided.",
                code="match_invalid_set_scores",
            )

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

    stage = await _get_match_stage(session, match)
    rating_sport_id = _rating_sport_id_for_stage(match.sport_id, stage)
    players_a = side_players.get("A", [])
    players_b = side_players.get("B", [])
    if not match.is_friendly and summary and players_a and players_b:
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
                        rating_sport_id,
                        players_a,
                        players_b,
                        draws=draws,
                        match_id=mid,
                    )
                except Exception:
                    pass
                await update_player_metrics(
                    session, rating_sport_id, [], [], draws
                )
            else:
                winner_side = "A" if a_sets > b_sets else "B"
                winners = players_a if winner_side == "A" else players_b
                losers = players_b if winner_side == "A" else players_a
                try:
                    await update_ratings(
                        session,
                        rating_sport_id,
                        winners,
                        losers,
                        match_id=mid,
                    )
                except Exception:
                    pass
                await update_player_metrics(
                    session, rating_sport_id, winners, losers
                )

    stage_id = match.stage_id
    await session.flush()
    if stage_id:
        await recompute_stage_standings(stage_id, session)
    await session.commit()
    if not match.is_friendly:
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
        raise http_problem(
            status_code=400,
            detail=f"unknown players: {', '.join(missing)}",
            code="match_unknown_players",
        )
    id_to_name = {pid: name for name, pid in name_to_id.items()}
    dup_ids = [
        pid
        for pid, cnt in Counter(name_to_id[n.lower()] for n in original_names).items()
        if cnt > 1
    ]
    if dup_ids:
        dups = [id_to_name[pid] for pid in dup_ids]
        raise http_problem(
            status_code=400,
            detail=f"duplicate players: {', '.join(dups)}",
            code="match_duplicate_players",
        )
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
        isFriendly=body.isFriendly,
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
        raise http_problem(
            status_code=404,
            detail="match not found",
            code="match_not_found",
        )

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
        stageId=m.stage_id,
        rulesetId=m.ruleset_id,
        bestOf=m.best_of,
        playedAt=_coerce_utc(m.played_at),
        location=m.location,
        isFriendly=m.is_friendly,
        participants=[
            ParticipantOut(id=p.id, side=p.side, playerIds=p.player_ids) for p in parts
        ],
        events=[
            ScoreEventOut(
                id=e.id,
                type=e.type,
                payload=e.payload,
                createdAt=_coerce_utc(e.created_at),
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
        raise http_problem(
            status_code=404,
            detail="match not found",
            code="match_not_found",
        )

    try:
        parts = (
            await session.execute(
                select(MatchParticipant).where(MatchParticipant.match_id == mid)
            )
        ).scalars().all()
    except Exception:
        parts = []
    match_player_ids = {pid for p in parts for pid in (p.player_ids or [])}
    stage = await _get_match_stage(session, m)
    rating_sport_id = _rating_sport_id_for_stage(m.sport_id, stage)
    if not user.is_admin:
        user_player_ids = (
            await session.execute(select(Player.id).where(Player.user_id == user.id))
        ).scalars().all()
        if not user_player_ids or not set(user_player_ids) & match_player_ids:
            raise http_problem(
                status_code=403,
                detail="forbidden",
                code="match_forbidden",
            )

    sport_id = m.sport_id
    stage_id = m.stage_id
    m.deleted_at = func.now()
    await session.flush()
    if stage_id:
        await recompute_stage_standings(stage_id, session)
    await session.commit()

    # Recompute ratings for this sport now that the match is removed
    try:
        # Reset existing ratings to the default value
        rows = (
            await session.execute(
                select(Rating).where(Rating.sport_id == rating_sport_id)
            )
        ).scalars().all()
        for r in rows:
            r.value = 1000.0
        await session.commit()

        # Replay remaining matches to rebuild ratings
        stmt = (
            select(Match, Stage)
            .join(Stage, Stage.id == Match.stage_id, isouter=True)
            .where(Match.sport_id == sport_id, Match.deleted_at.is_(None))
            .order_by(Match.played_at)
        )
        if rating_sport_id != sport_id:
            stmt = stmt.where(Stage.type == AMERICANO_STAGE_TYPE)
        else:
            stmt = stmt.where(
                or_(Stage.id.is_(None), Stage.type != AMERICANO_STAGE_TYPE)
            )
        rows = (await session.execute(stmt)).all()

        for match, match_stage in rows:
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
            current_rating_sport = _rating_sport_id_for_stage(
                match.sport_id, match_stage
            )
            if sets.get("A") == sets.get("B"):
                await update_ratings(
                    session,
                    current_rating_sport,
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
                    session, current_rating_sport, winners, losers, match_id=match.id
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
        raise http_problem(
            status_code=404,
            detail="match not found",
            code="match_not_found",
        )

    parts = (
        await session.execute(
            select(MatchParticipant).where(MatchParticipant.match_id == mid)
        )
    ).scalars().all()
    match_player_ids = {pid for p in parts for pid in (p.player_ids or [])}
    stage = await _get_match_stage(session, m)
    rating_sport_id = _rating_sport_id_for_stage(m.sport_id, stage)
    if not user.is_admin:
        user_player_ids = (
            await session.execute(select(Player.id).where(Player.user_id == user.id))
        ).scalars().all()
        if not user_player_ids or not set(user_player_ids) & match_player_ids:
            raise http_problem(
                status_code=403,
                detail="forbidden",
                code="match_forbidden",
            )

    try:
        engine = importlib.import_module(
            f"..scoring.{m.sport_id}", package="backend.app"
        )
    except ModuleNotFoundError:
        try:
            engine = importlib.import_module(f"app.scoring.{m.sport_id}")
        except ModuleNotFoundError:
            raise http_problem(
                status_code=400,
                detail="unknown sport",
                code="match_unknown_sport",
            )

    existing = (
        await session.execute(
            select(ScoreEvent).where(ScoreEvent.match_id == mid).order_by(ScoreEvent.created_at)
        )
    ).scalars().all()
    rating_recorded = any(ev.type == "RATING" for ev in existing)
    state = engine.init_state({})
    for old in existing:
        state = engine.apply(old.payload, state)

    payload = ev.model_dump()
    try:
        state = engine.apply(payload, state)
    except ValueError as exc:
        raise http_problem(
            status_code=400,
            detail=str(exc),
            code="match_event_invalid",
        )

    e = ScoreEvent(
        id=uuid.uuid4().hex,
        match_id=mid,
        type=ev.type,
        payload=payload,
    )
    session.add(e)
    m.details = engine.summary(state)
    summary = m.details if isinstance(m.details, dict) else None

    players_a = [pid for p in parts if p.side == "A" for pid in (p.player_ids or [])]
    players_b = [pid for p in parts if p.side == "B" for pid in (p.player_ids or [])]

    winners: list[str] = []
    losers: list[str] = []
    draws: list[str] = []

    def _to_int(value: object) -> int:
        try:
            return int(value)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return 0

    match_complete = False
    if (
        not rating_recorded
        and summary
        and players_a
        and players_b
    ):
        sets = summary.get("sets") if isinstance(summary, dict) else None
        if isinstance(sets, dict):
            sets_a = _to_int(sets.get("A"))
            sets_b = _to_int(sets.get("B"))
            total_sets = sets_a + sets_b
            if total_sets:
                sets_needed: int | None = None
                if m.best_of:
                    sets_needed = m.best_of // 2 + 1
                else:
                    config = summary.get("config")
                    if isinstance(config, dict):
                        cfg_sets = config.get("sets")
                        if isinstance(cfg_sets, int):
                            sets_needed = cfg_sets // 2 + 1 if cfg_sets else None
                if sets_needed:
                    match_complete = sets_a >= sets_needed or sets_b >= sets_needed
                else:
                    if sets_a != sets_b:
                        match_complete = True
                    elif sets_a == sets_b and sets_a > 0:
                        match_complete = True
                if match_complete:
                    if sets_a == sets_b:
                        draws = players_a + players_b
                    else:
                        winner_side = "A" if sets_a > sets_b else "B"
                        winners = players_a if winner_side == "A" else players_b
                        losers = players_b if winner_side == "A" else players_a

    if match_complete:
        try:
            await update_ratings(
                session,
                rating_sport_id,
                winners,
                losers,
                draws=draws or None,
                match_id=mid,
            )
        except Exception:
            pass
        await update_player_metrics(
            session, rating_sport_id, winners, losers, draws
        )

    stage_id = m.stage_id
    await session.flush()
    if stage_id:
        await recompute_stage_standings(stage_id, session)
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
        raise http_problem(
            status_code=404,
            detail="match not found",
            code="match_not_found",
        )
    if m.sport_id not in ("padel", "tennis"):
        raise http_problem(
            status_code=400,
            detail="set recording only supported for padel or tennis",
            code="match_set_recording_unsupported",
        )

    try:
        parts = (
            await session.execute(
                select(MatchParticipant).where(MatchParticipant.match_id == mid)
            )
        ).scalars().all()
    except Exception:
        parts = []
    stage = await _get_match_stage(session, m)
    rating_sport_id = _rating_sport_id_for_stage(m.sport_id, stage)
    if not user.is_admin:
        user_player_ids = (
            await session.execute(select(Player.id).where(Player.user_id == user.id))
        ).scalars().all()
        match_player_ids = {pid for p in parts for pid in (p.player_ids or [])}
        if not user_player_ids or not set(user_player_ids) & match_player_ids:
            raise http_problem(
                status_code=403,
                detail="forbidden",
                code="match_forbidden",
            )

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
        raise http_problem(
            status_code=422,
            detail=str(e),
            code="match_validation_error",
        )

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
                    rating_sport_id,
                    players_a,
                    players_b,
                    draws=draws,
                    match_id=mid,
                )
            except Exception:
                pass
            await update_player_metrics(
                session, rating_sport_id, [], [], draws
            )
        else:
            winner_side = "A" if sets["A"] > sets["B"] else "B"
            winners = players_a if winner_side == "A" else players_b
            losers = players_b if winner_side == "A" else players_a
            try:
                await update_ratings(
                    session, rating_sport_id, winners, losers, match_id=mid
                )
            except Exception:
                pass
            await update_player_metrics(
                session, rating_sport_id, winners, losers
            )

    stage_id = m.stage_id
    await session.flush()
    if stage_id:
        await recompute_stage_standings(stage_id, session)
    await session.commit()
    await player_stats_cache.invalidate_players(players_a + players_b)
    await broadcast(mid, {"summary": m.details})
    return {"ok": True, "added": len(new_events)}
