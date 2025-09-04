import uuid
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import Tournament, Stage, User
from ..schemas import TournamentCreate, TournamentOut, StageCreate, StageOut
from .admin import require_admin

router = APIRouter()


@router.post("/tournaments", response_model=TournamentOut)
async def create_tournament(
    body: TournamentCreate,
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(require_admin),
):
    tid = uuid.uuid4().hex
    t = Tournament(id=tid, sport_id=body.sport, name=body.name, club_id=body.clubId)
    session.add(t)
    await session.commit()
    return TournamentOut(id=tid, sport=body.sport, name=body.name, clubId=body.clubId)


@router.get("/tournaments", response_model=list[TournamentOut])
async def list_tournaments(session: AsyncSession = Depends(get_session)):
    rows = (await session.execute(select(Tournament))).scalars().all()
    return [
        TournamentOut(id=t.id, sport=t.sport_id, name=t.name, clubId=t.club_id)
        for t in rows
    ]


@router.get("/tournaments/{tournament_id}", response_model=TournamentOut)
async def get_tournament(
    tournament_id: str, session: AsyncSession = Depends(get_session)
):
    t = await session.get(Tournament, tournament_id)
    if not t:
        raise HTTPException(status_code=404, detail="tournament not found")
    return TournamentOut(id=t.id, sport=t.sport_id, name=t.name, clubId=t.club_id)


@router.post("/tournaments/{tournament_id}/stages", response_model=StageOut)
async def create_stage(
    tournament_id: str,
    body: StageCreate,
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(require_admin),
):
    sid = uuid.uuid4().hex
    s = Stage(id=sid, tournament_id=tournament_id, type=body.type)
    session.add(s)
    await session.commit()
    return StageOut(id=sid, tournamentId=tournament_id, type=body.type)


@router.get("/tournaments/{tournament_id}/stages", response_model=list[StageOut])
async def list_stages(tournament_id: str, session: AsyncSession = Depends(get_session)):
    rows = (
        await session.execute(select(Stage).where(Stage.tournament_id == tournament_id))
    ).scalars().all()
    return [StageOut(id=s.id, tournamentId=s.tournament_id, type=s.type) for s in rows]


@router.get(
    "/tournaments/{tournament_id}/stages/{stage_id}", response_model=StageOut
)
async def get_stage(
    tournament_id: str, stage_id: str, session: AsyncSession = Depends(get_session)
):
    s = await session.get(Stage, stage_id)
    if not s or s.tournament_id != tournament_id:
        raise HTTPException(status_code=404, detail="stage not found")
    return StageOut(id=s.id, tournamentId=s.tournament_id, type=s.type)


@router.delete("/tournaments/{tournament_id}", status_code=204)
async def delete_tournament(
    tournament_id: str,
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(require_admin),
):
    t = await session.get(Tournament, tournament_id)
    if not t:
        raise HTTPException(status_code=404, detail="tournament not found")
    await session.delete(t)
    await session.commit()
    return Response(status_code=204)

