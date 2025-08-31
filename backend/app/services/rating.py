import uuid
from typing import Sequence
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Rating

K_FACTOR = 32.0

async def update_ratings(
    session: AsyncSession,
    sport_id: str,
    winners: Sequence[str],
    losers: Sequence[str],
    k: float = K_FACTOR,
) -> None:
    """Update player ratings using a basic MMR/Elo system.

    The winner gains more points for beating a higher-rated opponent and
    loses fewer for losing against a stronger player. Ratings are created
    on the fly for new players with a default value of 1000.
    """
    if not winners or not losers:
        return

    ids = set(winners) | set(losers)
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
    win_delta = k * (1 - expected_win)
    lose_delta = -k * (1 - expected_win)

    for pid in winners:
        rating_map[pid].value += win_delta
    for pid in losers:
        rating_map[pid].value += lose_delta
