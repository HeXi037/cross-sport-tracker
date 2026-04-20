from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..exceptions import ProblemDetail, http_problem
from ..models import Club, Player, Rating, User
from ..schemas import ClubCreate, ClubOut
from .admin import require_admin

router = APIRouter(
    prefix="/clubs",
    tags=["clubs"],
    responses={404: {"model": ProblemDetail}},
)


def _to_club_out(club: Club) -> ClubOut:
    return ClubOut(id=club.id, name=club.name)


@router.post("", response_model=ClubOut, status_code=status.HTTP_201_CREATED)
async def create_club(
    body: ClubCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(require_admin),
) -> ClubOut:
    club = Club(id=body.id, name=body.name)
    session.add(club)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise http_problem(
            status_code=409,
            detail="club already exists",
            code="club_exists",
        )
    return _to_club_out(club)


@router.get("", response_model=list[ClubOut])
async def list_clubs(
    sport: Annotated[str | None, Query(description="Optional sport id filter")] = None,
    country: Annotated[
        str | None, Query(description="Optional country/location filter")
    ] = None,
    session: AsyncSession = Depends(get_session),
) -> list[ClubOut]:
    stmt = select(Club)
    if sport or country:
        stmt = (
            stmt.join(Player, Player.club_id == Club.id)
            .where(Player.deleted_at.is_(None))
            .distinct()
        )
        if sport:
            stmt = stmt.join(
                Rating,
                (Rating.player_id == Player.id) & (Rating.sport_id == sport),
            )
        if country:
            stmt = stmt.where(Player.location == country)

    rows = (await session.execute(stmt.order_by(Club.name))).scalars().all()
    return [_to_club_out(club) for club in rows]
