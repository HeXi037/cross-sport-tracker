from fastapi import APIRouter, Query, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import Rating, Player

# Resource-only prefix; no /api or /api/v0 here
router = APIRouter(prefix="/leaderboards", tags=["leaderboards"])


# GET /api/v0/leaderboards?sport=padel
@router.get("")
async def leaderboard(
    sport: str = Query(..., description="Sport id, e.g. 'padel' or 'bowling'"),
    session: AsyncSession = Depends(get_session),
):
    rows = (
        await session.execute(
            select(Rating, Player)
            .join(Player, Player.id == Rating.player_id)
            .where(Rating.sport_id == sport)
            .order_by(Rating.value.desc())
        )
    ).all()
    return {
        "sport": sport,
        "leaders": [
            {"playerId": r.Rating.player_id, "playerName": r.Player.name, "rating": r.Rating.value}
            for r in rows
        ],
    }
