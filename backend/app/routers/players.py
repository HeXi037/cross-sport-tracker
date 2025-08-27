# backend/app/routers/players.py
import uuid
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import Player
from ..schemas import PlayerCreate

# Resource-only prefix; versioning added in main.py
router = APIRouter(prefix="/players", tags=["players"])

# POST /api/v0/players
@router.post("")
async def create_player(body: PlayerCreate, session: AsyncSession = Depends(get_session)):
    pid = uuid.uuid4().hex
    p = Player(id=pid, name=body.name, club_id=body.club_id)
    session.add(p)
    await session.commit()
    return {"id": pid, "name": p.name, "club_id": p.club_id}

# GET /api/v0/players
@router.get("")
async def list_players(session: AsyncSession = Depends(get_session)):
    rows = (await session.execute(select(Player))).scalars().all()
    return [{"id": p.id, "name": p.name, "club_id": p.club_id} for p in rows]
