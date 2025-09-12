import uuid
from typing import Sequence
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Rating, MatchParticipant, Match, ScoreEvent

K_FACTOR = 32.0

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
    if not winners and not losers:
        return

    draws = list(draws or [])
    ids = set(winners) | set(losers) | set(draws)
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

    avg_win = sum(rating_map[pid].value for pid in winners) / len(winners)
    avg_lose = sum(rating_map[pid].value for pid in losers) / len(losers)

    expected_win = 1 / (1 + 10 ** ((avg_lose - avg_win) / 400))

    win_score = 0.5 if draws else 1.0
    lose_score = 0.5 if draws else 0.0

    # Determine K for each player based on number of matches played
    rows = (
        await session.execute(
            select(MatchParticipant.player_ids)
            .join(Match, MatchParticipant.match_id == Match.id)
            .where(Match.sport_id == sport_id, Match.deleted_at.is_(None))
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

    if match_id:
        for pid in ids:
            session.add(
                ScoreEvent(
                    id=uuid.uuid4().hex,
                    match_id=match_id,
                    type="RATING",
                    payload={"playerId": pid, "rating": rating_map[pid].value},
                )
            )
