from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import Sport
from ..schemas import SportRead

router = APIRouter(prefix="/api/v0/sports", tags=["sports"])


@router.get("", response_model=list[SportRead])
async def list_sports(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Sport))
    return [SportRead.model_validate(row) for row in result.scalars().all()]
