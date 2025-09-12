import uuid
from collections import defaultdict
from typing import Dict, List

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Rating, MasterRating


def _normalize(value: float, min_val: float, max_val: float) -> float:
    """Normalize a rating to a 0-1000 scale.

    If ``max_val`` equals ``min_val`` (all players have the same rating),
    a neutral value of 500 is returned to avoid division by zero.
    """
    if max_val <= min_val:
        return 500.0
    return ((value - min_val) / (max_val - min_val)) * 1000.0


async def update_master_ratings(session: AsyncSession) -> None:
    """Recompute and persist master ratings for all players.

    For each sport, player ratings are normalized to a 0–1000 scale using the
    formula ``(rating - min) / (max - min) * 1000``. A player's *master rating*
    is the average of their normalized ratings across all sports they have a
    rating for. Results are upserted into the ``master_rating`` table.
    """
    # Fetch per-sport min and max to normalize values
    stats_rows = (
        await session.execute(
            select(Rating.sport_id, func.min(Rating.value), func.max(Rating.value))
            .group_by(Rating.sport_id)
        )
    ).all()
    sport_stats: Dict[str, tuple[float, float]] = {
        r[0]: (r[1], r[2]) for r in stats_rows
    }

    # Gather normalized ratings per player
    rows = (await session.execute(select(Rating))).scalars().all()
    player_norms: Dict[str, List[float]] = defaultdict(list)
    for r in rows:
        min_val, max_val = sport_stats.get(r.sport_id, (r.value, r.value))
        norm = _normalize(r.value, min_val, max_val)
        player_norms[r.player_id].append(norm)

    # Load existing master ratings
    existing = (
        await session.execute(select(MasterRating))
    ).scalars().all()
    existing_map = {mr.player_id: mr for mr in existing}

    # Upsert master ratings
    for pid, norms in player_norms.items():
        avg = sum(norms) / len(norms)
        if pid in existing_map:
            existing_map[pid].value = avg
        else:
            session.add(
                MasterRating(id=uuid.uuid4().hex, player_id=pid, value=avg)
            )

    await session.commit()

    # Remove players that no longer have ratings
    stale_ids = set(existing_map) - set(player_norms)
    for pid in stale_ids:
        await session.delete(existing_map[pid])

    if stale_ids:
        await session.commit()

