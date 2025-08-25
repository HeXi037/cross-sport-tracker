from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import Player
from ..schemas import PlayerCreate, PlayerRead
from ..models import generate_ulid

router = APIRouter(prefix="/api/v0/players", tags=["players"])


@router.post("", response_model=PlayerRead)
async def create_player(player: PlayerCreate, session: AsyncSession = Depends(get_session)):
    db_player = Player(id=generate_ulid(), name=player.name)
    session.add(db_player)
    await session.commit()
    await session.refresh(db_player)
    return PlayerRead.model_validate(db_player)
