import uuid
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import Badge, PlayerBadge, User
from ..schemas import BadgeCreate, BadgeOut, BadgeUpdate
from ..exceptions import ProblemDetail
from .admin import require_admin

router = APIRouter(prefix="/badges", tags=["badges"], responses={404: {"model": ProblemDetail}})


@router.post("", response_model=BadgeOut)
async def create_badge(
    body: BadgeCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(require_admin),
):
    bid = uuid.uuid4().hex
    b = Badge(id=bid, name=body.name, icon=body.icon)
    session.add(b)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="badge name exists")
    return BadgeOut(id=bid, name=b.name, icon=b.icon)


@router.get("", response_model=list[BadgeOut])
async def list_badges(session: AsyncSession = Depends(get_session)):
    rows = (await session.execute(select(Badge))).scalars().all()
    return [BadgeOut(id=b.id, name=b.name, icon=b.icon) for b in rows]


@router.patch("/{badge_id}", response_model=BadgeOut)
async def update_badge(
    badge_id: str,
    body: BadgeUpdate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(require_admin),
):
    badge = await session.get(Badge, badge_id)
    if not badge:
        raise HTTPException(status_code=404, detail="badge not found")

    updates = body.model_dump(exclude_unset=True)
    if "name" in updates:
        badge.name = updates["name"]
    if "icon" in updates:
        badge.icon = updates["icon"]

    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="badge name exists")

    return BadgeOut(id=badge.id, name=badge.name, icon=badge.icon)


@router.delete("/{badge_id}", status_code=204)
async def delete_badge(
    badge_id: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(require_admin),
):
    badge = await session.get(Badge, badge_id)
    if not badge:
        raise HTTPException(status_code=404, detail="badge not found")

    await session.execute(delete(PlayerBadge).where(PlayerBadge.badge_id == badge_id))
    await session.delete(badge)
    await session.commit()
    return Response(status_code=204)
