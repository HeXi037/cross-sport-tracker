from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import Player
from ..routers.players import player_stats
from ..schemas import PlayerOut

TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "templates"
templates = Jinja2Templates(directory=str(TEMPLATE_DIR))

router = APIRouter()

@router.get("/players/{player_id}", response_class=HTMLResponse)
async def player_profile(
    request: Request,
    player_id: str,
    session: AsyncSession = Depends(get_session),
):
    player = await session.get(Player, player_id)
    if not player or player.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Player not found")

    stats = await player_stats(player_id, session)
    player_out = PlayerOut(
        id=player.id,
        name=player.name,
        club_id=player.club_id,
        photo_url=player.photo_url,
        location=player.location,
        country_code=player.country_code,
        region_code=player.region_code,
        ranking=player.ranking,
    )
    return templates.TemplateResponse(
        "player/profile.html",
        {"request": request, "player": player_out, "stats": stats},
    )
