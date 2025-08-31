from fastapi import APIRouter, Query, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import Rating, Player
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
    leaders = [
        LeaderboardEntryOut(
            rank=offset + i + 1,
            playerId=r.Rating.player_id,
            playerName=r.Player.name,
            rating=r.Rating.value,
            rankChange=0,  # TODO: compute change based on last 5 matches
        )
        for i, r in enumerate(rows)
    ]
    return LeaderboardOut(
        sport=sport, leaders=leaders, total=total, limit=limit, offset=offset
    )
