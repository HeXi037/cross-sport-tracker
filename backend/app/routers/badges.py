import uuid
from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..db import get_session
from ..models import Badge
from ..schemas import BadgeCreate, BadgeOut
from ..exceptions import ProblemDetail

router = APIRouter(prefix="/badges", tags=["badges"], responses={404: {"model": ProblemDetail}})


@router.post("", response_model=BadgeOut)
async def create_badge(body: BadgeCreate, session: AsyncSession = Depends(get_session)):
    bid = uuid.uuid4().hex
    b = Badge(id=bid, name=body.name, icon=body.icon)
    session.add(b)
    await session.commit()
    return BadgeOut(id=bid, name=b.name, icon=b.icon)


@router.get("", response_model=list[BadgeOut])
async def list_badges(session: AsyncSession = Depends(get_session)):
    rows = (await session.execute(select(Badge))).scalars().all()
    return [BadgeOut(id=b.id, name=b.name, icon=b.icon) for b in rows]
