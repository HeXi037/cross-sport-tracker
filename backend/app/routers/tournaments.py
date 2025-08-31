# backend/app/routers/tournaments.py
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import Tournament, Stage
from ..schemas import (
    TournamentCreate,
    TournamentOut,
    StageCreate,
    StageOut,
)

# Resource-only prefix; versioning is added in main.py
router = APIRouter(prefix="/tournaments", tags=["tournaments"])


@router.post("", response_model=TournamentOut)
async def create_tournament(
    body: TournamentCreate, session: AsyncSession = Depends(get_session)
):
    tid = uuid.uuid4().hex
    t = Tournament(
        id=tid,
        sport_id=body.sport,
        club_id=body.clubId,
        name=body.name,
    )
    session.add(t)
    await session.commit()
    return TournamentOut(id=tid, sport=t.sport_id, name=t.name, clubId=t.club_id)


@router.get("", response_model=list[TournamentOut])
async def list_tournaments(session: AsyncSession = Depends(get_session)):
    rows = (await session.execute(select(Tournament))).scalars().all()
    return [
        TournamentOut(id=t.id, sport=t.sport_id, name=t.name, clubId=t.club_id)
        for t in rows
    ]


@router.get("/{tid}", response_model=TournamentOut)
async def get_tournament(tid: str, session: AsyncSession = Depends(get_session)):
    t = await session.get(Tournament, tid)
    if not t:
        raise HTTPException(404, "tournament not found")
    return TournamentOut(id=t.id, sport=t.sport_id, name=t.name, clubId=t.club_id)


@router.post("/{tid}/stages", response_model=StageOut)
async def create_stage(
    tid: str, body: StageCreate, session: AsyncSession = Depends(get_session)
):
    t = await session.get(Tournament, tid)
    if not t:
        raise HTTPException(404, "tournament not found")
    sid = uuid.uuid4().hex
    s = Stage(id=sid, tournament_id=tid, type=body.type)
    session.add(s)
    await session.commit()
    return StageOut(id=sid, tournamentId=tid, type=s.type)


@router.get("/{tid}/stages", response_model=list[StageOut])
async def list_stages(tid: str, session: AsyncSession = Depends(get_session)):
    t = await session.get(Tournament, tid)
    if not t:
        raise HTTPException(404, "tournament not found")
    rows = (
        await session.execute(select(Stage).where(Stage.tournament_id == tid))
    ).scalars().all()
    return [StageOut(id=s.id, tournamentId=s.tournament_id, type=s.type) for s in rows]


@router.get("/{tid}/stages/{sid}", response_model=StageOut)
async def get_stage(tid: str, sid: str, session: AsyncSession = Depends(get_session)):
    s = await session.get(Stage, sid)
    if not s or s.tournament_id != tid:
        raise HTTPException(404, "stage not found")
    return StageOut(id=s.id, tournamentId=s.tournament_id, type=s.type)
