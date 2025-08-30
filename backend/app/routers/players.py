# backend/app/routers/players.py
import uuid
from fastapi import APIRouter, Depends, HTTPException
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
    exists = (await session.execute(select(Player).where(Player.name == body.name))).scalar_one_or_none()
    if exists:
        raise HTTPException(400, "player name already exists")
    pid = uuid.uuid4().hex
    p = Player(id=pid, name=body.name, club_id=body.club_id)
    session.add(p)
    await session.commit()
    return {"id": pid, "name": p.name, "club_id": p.club_id}

# GET /api/v0/players
@router.get("")
async def list_players(q: str = "", session: AsyncSession = Depends(get_session)):
    stmt = select(Player)
    if q:
        stmt = stmt.where(Player.name.ilike(f"%{q}%"))
    rows = (await session.execute(stmt)).scalars().all()
    return [{"id": p.id, "name": p.name, "club_id": p.club_id} for p in rows]

# GET /api/v0/players/{player_id}
@router.get("/{player_id}")
async def get_player(player_id: str, session: AsyncSession = Depends(get_session)):
    p = await session.get(Player, player_id)
    if not p:
        raise HTTPException(404, "player not found")
    return {"id": p.id, "name": p.name, "club_id": p.club_id}
