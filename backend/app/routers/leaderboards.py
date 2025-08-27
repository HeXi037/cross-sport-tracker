from fastapi import APIRouter, Query

# Resource-only prefix; no /api or /api/v0 here
router = APIRouter(prefix="/leaderboards", tags=["leaderboards"])

# GET /api/v0/leaderboards?sport=padel
@router.get("")  # or use "/"
async def leaderboard(
    sport: str = Query(..., description="Sport id, e.g. 'padel' or 'bowling'")
):
    # TODO: compute from Match results + Rating table
    return {"sport": sport, "leaders": []}
