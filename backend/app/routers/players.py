import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import Player
from ..schemas import PlayerCreate, PlayerOut, PlayerListOut

# Resource-only prefix; versioning added in main.py
router = APIRouter(prefix="/players", tags=["players"])

# POST /api/v0/players
@router.post("", response_model=PlayerOut)
async def create_player(body: PlayerCreate, session: AsyncSession = Depends(get_session)):
    exists = (await session.execute(select(Player).where(Player.name == body.name))).scalar_one_or_none()
    if exists:
        raise HTTPException(400, "player name already exists")
    pid = uuid.uuid4().hex
    p = Player(id=pid, name=body.name, club_id=body.club_id)
    session.add(p)
    await session.commit()
    return PlayerOut(id=pid, name=p.name, club_id=p.club_id)

# GET /api/v0/players
@router.get("", response_model=PlayerListOut)
async def list_players(
    q: str = "",
    limit: int = 50,
    offset: int = 0,
    session: AsyncSession = Depends(get_session),
):
    stmt = select(Player)
    count_stmt = select(func.count()).select_from(Player)
    if q:
        stmt = stmt.where(Player.name.ilike(f"%{q}%"))
        count_stmt = count_stmt.where(Player.name.ilike(f"%{q}%"))
    total = (await session.execute(count_stmt)).scalar()
    stmt = stmt.limit(limit).offset(offset)
    rows = (await session.execute(stmt)).scalars().all()
    players = [PlayerOut(id=p.id, name=p.name, club_id=p.club_id) for p in rows]
    return PlayerListOut(players=players, total=total, limit=limit, offset=offset)

# GET /api/v0/players/{player_id}
@router.get("/{player_id}", response_model=PlayerOut)
async def get_player(player_id: str, session: AsyncSession = Depends(get_session)):
    p = await session.get(Player, player_id)
    if not p:
        raise HTTPException(404, "player not found")
    return PlayerOut(id=p.id, name=p.name, club_id=p.club_id)
