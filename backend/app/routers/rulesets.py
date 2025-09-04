# backend/app/routers/rulesets.py
from fastapi import APIRouter, Depends, Query, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import uuid

from ..db import get_session
from ..models import RuleSet, User
from ..schemas import RuleSetOut, RuleSetCreate
from .admin import require_admin

# Resource-only prefix
router = APIRouter(prefix="/rulesets", tags=["rulesets"])

# GET /api/v0/rulesets?sport=padel
@router.get("", response_model=list[RuleSetOut])  # or use "/"
async def list_rulesets(
    sport: str = Query(..., description="Sport id, e.g. 'padel' or 'bowling'"),
    session: AsyncSession = Depends(get_session),
):
    rows = (await session.execute(select(RuleSet).where(RuleSet.sport_id == sport))).scalars().all()
    return [RuleSetOut(id=r.id, sport_id=r.sport_id, name=r.name, config=r.config) for r in rows]


@router.post("", response_model=RuleSetOut)
async def create_ruleset(
    body: RuleSetCreate,
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(require_admin),
):
    rid = uuid.uuid4().hex
    r = RuleSet(id=rid, sport_id=body.sport_id, name=body.name, config=body.config)
    session.add(r)
    await session.commit()
    return RuleSetOut(id=rid, sport_id=body.sport_id, name=body.name, config=body.config)


@router.delete("/{ruleset_id}", status_code=204)
async def delete_ruleset(
    ruleset_id: str,
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(require_admin),
):
    r = await session.get(RuleSet, ruleset_id)
    if not r:
        raise HTTPException(status_code=404, detail="ruleset not found")
    await session.delete(r)
    await session.commit()
    return Response(status_code=204)
