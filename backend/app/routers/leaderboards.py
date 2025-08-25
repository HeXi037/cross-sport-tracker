from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import Rating, Player
from ..schemas import LeaderboardEntry

router = APIRouter(prefix="/api/v0/leaderboards", tags=["leaderboards"])


@router.get("", response_model=list[LeaderboardEntry])
async def leaderboard(sport: str = Query(...), session: AsyncSession = Depends(get_session)):
    result = await session.execute(
        select(Rating, Player).join(Player, Rating.player_id == Player.id).where(Rating.sport_id == sport).order_by(Rating.value.desc())
    )
    entries = []
    for rating, player in result.all():
        entries.append(LeaderboardEntry(player_id=player.id, player_name=player.name, value=rating.value))
    return entries
