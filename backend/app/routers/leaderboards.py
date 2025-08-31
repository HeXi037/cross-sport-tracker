from fastapi import APIRouter, Query, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import Rating, Player, Match, MatchParticipant
from ..schemas import LeaderboardEntryOut, LeaderboardOut

# Resource-only prefix; no /api or /api/v0 here
router = APIRouter(prefix="/leaderboards", tags=["leaderboards"])


# GET /api/v0/leaderboards?sport=padel
@router.get("", response_model=LeaderboardOut)
async def leaderboard(
    sport: str = Query(..., description="Sport id, e.g. 'padel' or 'bowling'"),
    limit: int = 50,
    offset: int = 0,
    session: AsyncSession = Depends(get_session),
):
    stmt = (
        select(Rating, Player)
        .join(Player, Player.id == Rating.player_id)
        .where(Rating.sport_id == sport)
        .order_by(Rating.value.desc())
    )
    count_stmt = select(func.count()).select_from(Rating).where(Rating.sport_id == sport)
    total = (await session.execute(count_stmt)).scalar()
    rows = (await session.execute(stmt.limit(limit).offset(offset))).all()

    # Precompute set stats for players returned by the ranking query.
    player_ids = [r.Rating.player_id for r in rows]
    set_stats = {pid: {"won": 0, "lost": 0} for pid in player_ids}

    if player_ids:
        mp_rows = (
            await session.execute(
                select(MatchParticipant, Match)
                .join(Match, Match.id == MatchParticipant.match_id)
                .where(Match.sport_id == sport)
            )
        ).all()
        for mp, m in mp_rows:
            if not m.details or "sets" not in m.details:
                continue
            sets = m.details.get("sets", {})
            won = sets.get(mp.side, 0)
            opp = "B" if mp.side == "A" else "A"
            lost = sets.get(opp, 0)
            for pid in mp.player_ids:
                if pid in set_stats:
                    set_stats[pid]["won"] += won
                    set_stats[pid]["lost"] += lost

    leaders = []
    for i, r in enumerate(rows):
        pid = r.Rating.player_id
        stats = set_stats.get(pid, {"won": 0, "lost": 0})
        won = stats["won"]
        lost = stats["lost"]
        leaders.append(
            LeaderboardEntryOut(
                rank=offset + i + 1,
                playerId=pid,
                playerName=r.Player.name,
                rating=r.Rating.value,
                rankChange=0,  # TODO: compute change based on last 5 matches
                sets=won + lost,
                setsWon=won,
                setsLost=lost,
                setDiff=won - lost,
            )
        )

    return LeaderboardOut(
        sport=sport, leaders=leaders, total=total, limit=limit, offset=offset
    )
