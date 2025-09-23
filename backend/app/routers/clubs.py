from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import Club
from ..schemas import ClubOut

router = APIRouter(prefix="/clubs", tags=["clubs"])


@router.get("", response_model=list[ClubOut])
async def list_clubs(session: AsyncSession = Depends(get_session)) -> list[ClubOut]:
    rows = (await session.execute(select(Club).order_by(Club.name))).scalars().all()
    return [ClubOut(id=club.id, name=club.name) for club in rows]
