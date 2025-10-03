# backend/app/routers/matches.py
import uuid
import importlib
from collections import Counter
from datetime import datetime
from typing import Any, Sequence, NamedTuple

from fastapi import APIRouter, Depends, Query, Response, Request
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
from ..services.validation import (
    validate_set_scores,
    ValidationError,
    validate_participants_for_sport,
    validate_score_totals,
)
from ..services import (
    update_ratings,
    update_player_metrics,
    recompute_stage_standings,
)
from ..services.notifications import notify_match_recorded
from ..exceptions import http_problem
from .auth import get_current_user, limiter
from ..time_utils import coerce_utc

# Resource-only prefix; versioning is added in main.py
router = APIRouter(prefix="/matches", tags=["matches"])

DEFAULT_SCORE_LIMIT = 1000
SPORT_SCORE_LIMITS = {
    "bowling": 300,
    "disc_golf": 400,
    "padel": 99,
    "padel_americano": 99,
    "tennis": 99,
    "pickleball": 99,
}


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        parts = [ip.strip() for ip in forwarded.split(",") if ip.strip()]
        if parts:
            return parts[-1]
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip
    if request.client and request.client.host:
        return request.client.host
    return "anonymous"


def _rate_limit_key(request: Request) -> str:
    return _client_ip(request)


def _rate_limit_cost(request: Request) -> int:
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.strip():
        return 0
    return 1


def _coerce_utc(value: datetime | None) -> datetime | None:
    return coerce_utc(value)


AMERICANO_STAGE_TYPE = "americano"
AMERICANO_RATING_SUFFIX = "_americano"
LOWER_SCORE_WINS_SPORTS = {"disc_golf"}


def _rating_sport_id_for_stage(sport_id: str, stage: Stage | None) -> str:
    if stage and stage.type == AMERICANO_STAGE_TYPE:
        return f"{sport_id}{AMERICANO_RATING_SUFFIX}"
    return sport_id


async def _get_match_stage(session: AsyncSession, match: Match) -> Stage | None:
    if not match.stage_id:
        return None
    return await session.get(Stage, match.stage_id)


class MatchOutcome(NamedTuple):
    winners: list[str]
    losers: list[str]
    draws: list[str]
    winner_sides: list[str]
    loser_sides: list[str]
    draw_sides: list[str]


def _score_value(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _resolve_match_outcome(
    sport_id: str,
    side_players: dict[str, list[str]],
    details: dict[str, Any] | None,
) -> MatchOutcome | None:
    if not details:
        return None

    sides_with_players = {
        side: [pid for pid in players if pid]
        for side, players in side_players.items()
        if players
    }
    if len(sides_with_players) < 2:
        return None

    sets_record = details.get("sets") if isinstance(details, dict) else None
    if isinstance(sets_record, dict):
        a_sets = _score_value(sets_record.get("A"))
        b_sets = _score_value(sets_record.get("B"))
        if a_sets is not None and b_sets is not None:
            players_a = sides_with_players.get("A", [])
            players_b = sides_with_players.get("B", [])
            if players_a and players_b:
                if a_sets == b_sets:
                    draws = players_a + players_b
                    return MatchOutcome([], [], draws, [], [], ["A", "B"])
                winner_side = "A" if a_sets > b_sets else "B"
                loser_side = "B" if winner_side == "A" else "A"
                winners = sides_with_players[winner_side]
                losers = sides_with_players[loser_side]
                return MatchOutcome(
                    winners,
                    losers,
                    [],
                    [winner_side],
                    [loser_side],
                    [],
                )

    score_record = details.get("score") if isinstance(details, dict) else None
    if isinstance(score_record, dict):
        parsed_scores: dict[str, int] = {}
        for side, raw_value in score_record.items():
            players = sides_with_players.get(str(side))
            if not players:
                continue
            parsed = _score_value(raw_value)
            if parsed is None:
                continue
            parsed_scores[str(side)] = parsed

        if len(parsed_scores) >= 2:
            higher_is_better = sport_id not in LOWER_SCORE_WINS_SPORTS
            best_value = (
                max(parsed_scores.values())
                if higher_is_better
                else min(parsed_scores.values())
            )
            top_sides = [
                side for side, value in parsed_scores.items() if value == best_value
            ]
            other_sides: list[str] = [
                side for side in parsed_scores if side not in top_sides
            ]
            for side in sides_with_players:
                if side not in parsed_scores and side not in top_sides:
                    other_sides.append(side)

            winners: list[str] = []
            draws: list[str] = []
            if len(top_sides) == 1:
                winners = [
                    pid
                    for side in top_sides
                    for pid in sides_with_players.get(side, [])
                ]
            else:
                draws = [
                    pid
                    for side in top_sides
                    for pid in sides_with_players.get(side, [])
                ]

            losers = [
                pid
                for side in other_sides
                for pid in sides_with_players.get(side, [])
            ]

            return MatchOutcome(
                winners,
                losers,
                draws,
                top_sides if winners else [],
                other_sides,
                top_sides if draws else [],
            )

    return None


def _rating_groups_for_update(
    outcome: MatchOutcome, side_players: dict[str, list[str]]
) -> tuple[list[str], list[str]]:
    winners = outcome.winners
    losers = outcome.losers
    draws = outcome.draws

    if winners and losers:
        return winners, losers
    if draws and losers and not winners:
        return draws, losers
    if winners and draws and not losers:
        return winners, draws
    if draws and not winners and not losers:
        draw_sides = outcome.draw_sides
        if not draw_sides:
            draw_sides = [
                side
                for side, players in side_players.items()
                if any(pid in draws for pid in players)
            ]
        if len(draw_sides) < 2:
            midpoint = len(draws) // 2 or 1
            return draws[:midpoint], draws[midpoint:]
        half = len(draw_sides) // 2 or 1
        first_sides = draw_sides[:half]
        second_sides = draw_sides[half:]
        first_players = [
            pid
            for side in first_sides
            for pid in side_players.get(side, [])
            if pid in draws
        ]
        second_players = [
            pid
            for side in second_sides
            for pid in side_players.get(side, [])
            if pid in draws
        ]
        if not first_players or not second_players:
            midpoint = len(draws) // 2 or 1
            return draws[:midpoint], draws[midpoint:]
        return first_players, second_players
    return winners, losers

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
            await session.execute(
                select(Player).where(
                    Player.id.in_(player_ids),
                    Player.deleted_at.is_(None),
                )
            )
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
async def create_match(
    body: MatchCreate,
    session: AsyncSession,
    user: User,
) -> MatchIdOut:
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

    try:
        validate_participants_for_sport(body.sport, side_players)
    except ValidationError as exc:
        raise http_problem(
            status_code=422,
            detail=str(exc),
            code="match_invalid_participants",
        )

    unique_player_ids = {pid for pid in all_player_ids}
    if unique_player_ids:
        existing_players = (
            await session.execute(
                select(Player.id)
                .where(Player.id.in_(unique_player_ids))
                .where(Player.deleted_at.is_(None))
            )
        ).scalars().all()
        missing_players = sorted(unique_player_ids - set(existing_players))
        if missing_players:
            raise http_problem(
                status_code=400,
                detail="unknown players: " + ", ".join(missing_players),
                code="match_unknown_players",
            )

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
            side_totals: dict[str, int] = {}

            def _coerce_total(value: Any) -> int | None:
                if isinstance(value, bool):
                    return None
                try:
                    return int(value)
                except (TypeError, ValueError):
                    return None

            for player in players:
                if not isinstance(player, dict):
                    normalized_players.append(player)
                    continue
                player_payload = dict(player)
                if "scores" not in player_payload and "frameScores" in player_payload:
                    player_payload["scores"] = player_payload["frameScores"]
                    players_updated = True
                side = player_payload.get("side")
                total = _coerce_total(player_payload.get("total"))
                if isinstance(side, str) and total is not None:
                    side_totals.setdefault(side, total)
                normalized_players.append(player_payload)
            if players_updated:
                extra_details = dict(extra_details)
                extra_details["players"] = normalized_players
            if side_totals and "score" not in extra_details:
                extra_details = dict(extra_details)
                extra_details["score"] = side_totals
    summary: dict[str, Any] | None = None
    set_pairs: list[tuple[int, int]] = []
    score_events: list[dict[str, Any]] = []

    normalized_score_values: list[int] | None = None

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
                max_points_per_side=DEFAULT_SCORE_LIMIT,
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
    elif body.score is not None:
        max_score = SPORT_SCORE_LIMITS.get(match.sport_id, DEFAULT_SCORE_LIMIT)
        try:
            normalized_score_values = validate_score_totals(
                body.score, max_value=max_score
            )
        except ValidationError as exc:
            raise http_problem(
                status_code=422,
                detail=str(exc),
                code="match_invalid_score",
            )
        if len(normalized_score_values) != len(body.participants):
            raise http_problem(
                status_code=422,
                detail="score entries must match the number of participants",
                code="match_invalid_score",
            )
        score_detail = {
            "score": {chr(65 + i): s for i, s in enumerate(normalized_score_values)}
        }
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
    sides_with_players = {
        side: [pid for pid in players if pid]
        for side, players in side_players.items()
        if players
    }

    if not match.is_friendly and len(sides_with_players) >= 2:
        details_for_result: dict[str, Any] = {}
        if isinstance(match.details, dict):
            details_for_result = match.details
        elif isinstance(summary, dict):
            details_for_result = summary

        outcome = _resolve_match_outcome(match.sport_id, sides_with_players, details_for_result)
        if outcome:
            winners, losers, draws, *_ = outcome
            rating_winners, rating_losers = _rating_groups_for_update(
                outcome, sides_with_players
            )
            try:
                if rating_winners and rating_losers:
                    await update_ratings(
                        session,
                        rating_sport_id,
                        rating_winners,
                        rating_losers,
                        draws=draws or None,
                        match_id=mid,
                    )
            except Exception:
                pass
            await update_player_metrics(
                session, rating_sport_id, winners, losers, draws or None
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
    await notify_match_recorded(session, match, side_players, actor=user)
    return MatchIdOut(id=mid)


@router.post("", response_model=MatchIdOut)
@limiter.limit("30/minute", key_func=_rate_limit_key, cost=_rate_limit_cost)
async def create_match_route(
    request: Request,
    body: MatchCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> MatchIdOut:
    return await create_match(body, session, user)


async def create_match_by_name(
    body: MatchCreateByName,
    session: AsyncSession,
    user: User,
) -> MatchIdOut:
    def _normalize_lookup_name(name: str) -> str:
        """Normalize a player name for lookup in the database."""

        stripped = name.strip()
        if not stripped:
            return ""
        collapsed = " ".join(stripped.split())
        return collapsed.lower()

    name_to_id: dict[str, str] = {}
    rows: list[Player] = []
    original_names = [n for part in body.participants for n in part.playerNames]
    normalized_names = [_normalize_lookup_name(n) for n in original_names]
    lookup_names = [n for n in normalized_names if n]
    if lookup_names:
        rows = (
            await session.execute(
                select(Player).where(
                    func.lower(Player.name).in_(lookup_names),
                    Player.deleted_at.is_(None),
                )
            )
        ).scalars().all()
        name_to_id = {p.name.lower(): p.id for p in rows}
    missing = [
        original_names[idx]
        for idx, normalized in enumerate(normalized_names)
        if normalized not in name_to_id
    ]
    if missing:
        raise http_problem(
            status_code=400,
            detail=f"unknown players: {', '.join(missing)}",
            code="match_unknown_players",
        )
    id_to_name = {p.id: p.name for p in rows}
    dup_ids = [
        pid
        for pid, cnt in Counter(
            name_to_id[normalized]
            for normalized in normalized_names
            if normalized in name_to_id
        ).items()
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
        ids = [name_to_id[_normalize_lookup_name(n)] for n in part.playerNames]
        parts.append(Participant(side=part.side, playerIds=ids))
    sets = None
    if body.sets:
        sets = [list(scores) for scores in body.sets]
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


@router.post("/by-name", response_model=MatchIdOut)
@limiter.limit("30/minute", key_func=_rate_limit_key, cost=_rate_limit_cost)
async def create_match_by_name_route(
    request: Request,
    body: MatchCreateByName,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> MatchIdOut:
    return await create_match_by_name(body, session, user)

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
            side_players = {
                p.side: [pid for pid in (p.player_ids or []) if pid]
                for p in parts
                if p.side
            }
            side_players = {
                side: players for side, players in side_players.items() if players
            }
            if len(side_players) < 2:
                continue

            details = match.details if isinstance(match.details, dict) else None
            outcome = _resolve_match_outcome(match.sport_id, side_players, details)
            if not outcome:
                continue

            current_rating_sport = _rating_sport_id_for_stage(
                match.sport_id, match_stage
            )
            winners, losers, draws, *_ = outcome
            rating_winners, rating_losers = _rating_groups_for_update(
                outcome, side_players
            )
            if not rating_winners or not rating_losers:
                continue
            await update_ratings(
                session,
                current_rating_sport,
                rating_winners,
                rating_losers,
                draws=draws or None,
                match_id=match.id,
            )
        await session.commit()
    except Exception:
        # Ignore errors (e.g., rating tables may not exist in some tests)
        pass

    await player_stats_cache.invalidate_players(match_player_ids)
    return Response(status_code=204)

# POST /api/v0/matches/{mid}/events
async def append_event(
    mid: str,
    ev: EventIn,
    session: AsyncSession,
    user: User,
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
        rating_winners = winners or (players_a if draws else [])
        rating_losers = losers or (players_b if draws else [])
        try:
            await update_ratings(
                session,
                rating_sport_id,
                rating_winners,
                rating_losers,
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


@router.post("/{mid}/events")
@limiter.limit("60/minute", key_func=_rate_limit_key, cost=_rate_limit_cost)
async def append_event_route(
    request: Request,
    mid: str,
    ev: EventIn,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    return await append_event(mid, ev, session, user)


async def record_sets_endpoint(
    mid: str,
    body: SetsIn,
    session: AsyncSession,
    user: User,
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


@router.post("/{mid}/sets")
@limiter.limit("30/minute", key_func=_rate_limit_key, cost=_rate_limit_cost)
async def record_sets_route(
    request: Request,
    mid: str,
    body: SetsIn,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    return await record_sets_endpoint(mid, body, session, user)
