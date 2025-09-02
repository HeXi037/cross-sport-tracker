from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import PlayerMetric

async def update_player_metrics(
    session: AsyncSession,
    sport_id: str,
    winners: list[str],
    losers: list[str],
    draws: list[str] | None = None,
) -> None:
    """Update per-player metrics for a completed match."""
    draws = draws or []
    all_players = set(winners + losers + draws)
    if not all_players:
        return
    rows = (
        await session.execute(
            select(PlayerMetric).where(
                PlayerMetric.player_id.in_(all_players),
                PlayerMetric.sport_id == sport_id,
            )
        )
    ).scalars().all()
    existing = {pm.player_id: pm for pm in rows}
    for pid in all_players:
        pm = existing.get(pid)
        if not pm:
            pm = PlayerMetric(
                player_id=pid,
                sport_id=sport_id,
                metrics={},
                milestones=[],
            )
            session.add(pm)
        metrics = dict(pm.metrics or {})
        milestones = list(pm.milestones or [])
        metrics["matches"] = metrics.get("matches", 0) + 1
        if pid in winners:
            metrics["wins"] = metrics.get("wins", 0) + 1
            if metrics["wins"] == 1 and "firstWin" not in milestones:
                milestones.append("firstWin")
        elif pid in losers:
            metrics["losses"] = metrics.get("losses", 0) + 1
        pm.metrics = metrics
        pm.milestones = milestones
