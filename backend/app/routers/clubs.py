from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..exceptions import ProblemDetail, http_problem
from ..models import Club, User
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
async def list_clubs(session: AsyncSession = Depends(get_session)) -> list[ClubOut]:
    rows = (await session.execute(select(Club).order_by(Club.name))).scalars().all()
    return [_to_club_out(club) for club in rows]
