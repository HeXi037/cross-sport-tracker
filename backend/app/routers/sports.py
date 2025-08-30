from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import Sport
from ..schemas import SportOut

router = APIRouter(prefix="/sports", tags=["sports"])

# GET /api/v0/sports
@router.get("", response_model=list[SportOut])  # or use "/" — both work as the router's root
async def list_sports(session: AsyncSession = Depends(get_session)):
    rows = (await session.execute(select(Sport))).scalars().all()
    return [SportOut(id=s.id, name=s.name) for s in rows]
