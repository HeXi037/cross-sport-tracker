# backend/app/routers/rulesets.py
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import RuleSet

# Resource-only prefix
router = APIRouter(prefix="/rulesets", tags=["rulesets"])

# GET /api/v0/rulesets?sport=padel
@router.get("")  # or use "/"
async def list_rulesets(
    sport: str = Query(..., description="Sport id, e.g. 'padel' or 'bowling'"),
    session: AsyncSession = Depends(get_session),
):
    rows = (await session.execute(select(RuleSet).where(RuleSet.sport_id == sport))).scalars().all()
    return [
        {"id": r.id, "sport_id": r.sport_id, "name": r.name, "config": r.config}
        for r in rows
    ]
