from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import RuleSet, Sport
from ..schemas import RuleSetRead

router = APIRouter(prefix="/api/v0/rulesets", tags=["rulesets"])


@router.get("", response_model=list[RuleSetRead])
async def list_rulesets(sport: str = Query(...), session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(RuleSet).join(Sport).where(Sport.id == sport))
    return [RuleSetRead.model_validate(r) for r in result.scalars().all()]
