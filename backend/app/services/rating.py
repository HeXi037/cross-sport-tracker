import math
import uuid
from datetime import datetime
from typing import Sequence

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from ..db_errors import is_missing_table_error
from ..models import GlickoRating, Match, MatchParticipant, Rating, ScoreEvent

K_FACTOR = 32.0
GLICKO_DEFAULT_RATING = 1500.0
GLICKO_DEFAULT_RD = 350.0
GLICKO_MIN_RD = 30.0
GLICKO_MAX_RD = 350.0
GLICKO_SCALE = 173.7178


def _glicko_update(
    rating: float, rd: float, outcomes: Sequence[tuple[float, float, float]]
) -> tuple[float, float]:
    """Return updated Glicko rating and rating deviation.

    Args:
        rating: Current rating value.
        rd: Current rating deviation.
        outcomes: Sequence of tuples ``(opponent_rating, opponent_rd, score)`` where
            ``score`` is ``1`` for a win, ``0`` for a loss, and ``0.5`` for a draw.
    """

    if not outcomes:
        # No new information – let the RD drift slightly upward to express uncertainty.
        new_rd = min(GLICKO_MAX_RD, math.sqrt(rd**2 + (GLICKO_MIN_RD / 2) ** 2))
        return rating, new_rd

    mu = (rating - GLICKO_DEFAULT_RATING) / GLICKO_SCALE
    phi = max(rd / GLICKO_SCALE, 1e-6)

    denom = 0.0
    delta_sum = 0.0
    for opp_rating, opp_rd, score in outcomes:
        mu_j = (opp_rating - GLICKO_DEFAULT_RATING) / GLICKO_SCALE
        phi_j = max(opp_rd / GLICKO_SCALE, 1e-6)
        g = 1 / math.sqrt(1 + 3 * (phi_j**2) / (math.pi**2))
        e = 1 / (1 + math.exp(-g * (mu - mu_j)))
        denom += (g**2) * e * (1 - e)
        delta_sum += g * (score - e)

    if denom <= 0:
        return rating, max(GLICKO_MIN_RD, min(GLICKO_MAX_RD, rd))

    v = 1 / denom
    phi_star = phi  # assume instantaneous rating periods
    phi_prime = 1 / math.sqrt((1 / (phi_star**2)) + (1 / v))
    mu_prime = mu + (phi_prime**2) * delta_sum

    new_rating = (mu_prime * GLICKO_SCALE) + GLICKO_DEFAULT_RATING
    new_rd = max(GLICKO_MIN_RD, min(GLICKO_MAX_RD, phi_prime * GLICKO_SCALE))
    return new_rating, new_rd


def _average_glicko(opponents: Sequence[GlickoRating]) -> tuple[float, float]:
    if not opponents:
        return GLICKO_DEFAULT_RATING, GLICKO_DEFAULT_RD
    rating = sum(o.rating for o in opponents) / len(opponents)
    rd = sum(o.rd for o in opponents) / len(opponents)
    return rating, rd

async def update_ratings(
    session: AsyncSession,
    sport_id: str,
    winners: Sequence[str],
    losers: Sequence[str],
    draws: Sequence[str] | None = None,
    match_id: str | None = None,
    k: float = K_FACTOR,
) -> None:
    """Update player ratings using a basic MMR/Elo system.

    The winner gains more points for beating a higher-rated opponent and
    loses fewer for losing against a stronger player. Ratings are created
    on the fly for new players with a default value of 1000.
    """
    draws = list(draws or [])
    if not winners and not losers and not draws:
        return

    ids = set(winners) | set(losers) | set(draws)
    if not ids:
        return
    rows = (
        await session.execute(
            select(Rating).where(Rating.player_id.in_(ids), Rating.sport_id == sport_id)
        )
    ).scalars().all()
    rating_map = {r.player_id: r for r in rows}

    for pid in ids:
        if pid not in rating_map:
            r = Rating(id=uuid.uuid4().hex, player_id=pid, sport_id=sport_id, value=1000.0)
            session.add(r)
            rating_map[pid] = r

    glicko_map: dict[str, GlickoRating] = {}
    glicko_disabled = False
    try:
        glicko_rows = (
            await session.execute(
                select(GlickoRating).where(
                    GlickoRating.player_id.in_(ids), GlickoRating.sport_id == sport_id
                )
            )
        ).scalars().all()
    except SQLAlchemyError as exc:  # pragma: no cover - optional table
        if not is_missing_table_error(exc, GlickoRating.__tablename__):
            raise
        glicko_disabled = True
    else:
        glicko_map = {r.player_id: r for r in glicko_rows}

    if not glicko_disabled:
        for pid in ids:
            if pid not in glicko_map:
                glicko = GlickoRating(
                    id=uuid.uuid4().hex,
                    player_id=pid,
                    sport_id=sport_id,
                    rating=GLICKO_DEFAULT_RATING,
                    rd=GLICKO_DEFAULT_RD,
                    last_updated=datetime.utcnow(),
                )
                session.add(glicko)
                glicko_map[pid] = glicko

    win_score = 0.5 if draws else 1.0
    lose_score = 0.5 if draws else 0.0

    if winners and losers:
        avg_win = sum(rating_map[pid].value for pid in winners) / len(winners)
        avg_lose = sum(rating_map[pid].value for pid in losers) / len(losers)

        expected_win = 1 / (1 + 10 ** ((avg_lose - avg_win) / 400))

        # Determine K for each player based on number of matches played
        rows = (
            await session.execute(
                select(MatchParticipant.player_ids)
                .join(Match, MatchParticipant.match_id == Match.id)
                .where(
                    Match.sport_id == sport_id,
                    Match.deleted_at.is_(None),
                    Match.is_friendly.is_(False),
                )
            )
        ).scalars().all()

        match_counts = {pid: 0 for pid in ids}
        for player_ids in rows:
            for pid in ids:
                if pid in player_ids:
                    match_counts[pid] += 1

        k_map: dict[str, float] = {}
        for pid in ids:
            k_map[pid] = k / 2 if match_counts[pid] > 30 else k

        for pid in winners:
            rating_map[pid].value += k_map[pid] * (win_score - expected_win)
        for pid in losers:
            rating_map[pid].value += k_map[pid] * (lose_score - (1 - expected_win))

    glicko_payload: dict[str, tuple[float, float]] = {}
    if not glicko_disabled:
        winner_set = set(winners)
        loser_set = set(losers)
        draw_set = set(draws)

        def opponent_ids(pid: str) -> list[str]:
            if pid in winner_set:
                opponents = list(loser_set)
                if not opponents and draw_set:
                    opponents = [d for d in draw_set if d != pid]
                return opponents
            if pid in loser_set:
                opponents = list(winner_set)
                if not opponents and draw_set:
                    opponents = [d for d in draw_set if d != pid]
                return opponents
            # draws only (no win/lose info)
            return [p for p in (winner_set | loser_set | draw_set) if p != pid]

        score_map: dict[str, float] = {}
        for pid in ids:
            if pid in winner_set:
                score_map[pid] = win_score
            elif pid in loser_set:
                score_map[pid] = lose_score
            else:
                score_map[pid] = 0.5

        for pid in ids:
            opponents = opponent_ids(pid)
            if not opponents:
                current = glicko_map.get(pid)
                if current is not None:
                    glicko_payload[pid] = (current.rating, current.rd)
                continue
            opponent_rows = [glicko_map[o] for o in opponents if o in glicko_map]
            if not opponent_rows:
                current = glicko_map.get(pid)
                if current is not None:
                    glicko_payload[pid] = (current.rating, current.rd)
                continue
            opp_rating, opp_rd = _average_glicko(opponent_rows)
            current = glicko_map[pid]
            new_rating, new_rd = _glicko_update(current.rating, current.rd, [(opp_rating, opp_rd, score_map[pid])])
            current.rating = new_rating
            current.rd = new_rd
            current.last_updated = datetime.utcnow()
            glicko_payload[pid] = (new_rating, new_rd)

        for pid in ids:
            if pid not in glicko_payload and pid in glicko_map:
                current = glicko_map[pid]
                glicko_payload[pid] = (current.rating, current.rd)

    if match_id:
        for pid in ids:
            payload: dict[str, object] = {
                "playerId": pid,
                "rating": rating_map[pid].value,
                "systems": {
                    "elo": {"rating": rating_map[pid].value},
                },
            }
            if not glicko_disabled and pid in glicko_payload:
                rating_value, rd_value = glicko_payload[pid]
                payload["systems"]["glicko"] = {"rating": rating_value, "rd": rd_value}
            session.add(
                ScoreEvent(
                    id=uuid.uuid4().hex,
                    match_id=match_id,
                    type="RATING",
                    payload=payload,
                )
            )
