import uuid
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..exceptions import ProblemDetail
from ..models import Badge, PlayerBadge, User
from ..schemas import BadgeCreate, BadgeOut, BadgeUpdate
from .admin import require_admin

router = APIRouter(prefix="/badges", tags=["badges"], responses={404: {"model": ProblemDetail}})


def _to_badge_out(badge: Badge) -> BadgeOut:
    return BadgeOut(id=badge.id, name=badge.name, icon=badge.icon)


@router.post("", response_model=BadgeOut)
async def create_badge(
    body: BadgeCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(require_admin),
):
    badge = Badge(id=uuid.uuid4().hex, name=body.name, icon=body.icon)
    session.add(badge)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="badge name exists")
    return _to_badge_out(badge)


@router.get("", response_model=list[BadgeOut])
async def list_badges(session: AsyncSession = Depends(get_session)):
    rows = (await session.execute(select(Badge))).scalars().all()
    return [_to_badge_out(badge) for badge in rows]


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
    for field, value in updates.items():
        setattr(badge, field, value)

    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="badge name exists")

    return _to_badge_out(badge)


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
