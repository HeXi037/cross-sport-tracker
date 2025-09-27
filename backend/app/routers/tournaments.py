import uuid
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import Tournament, Stage, StageStanding
from ..schemas import (
    TournamentCreate,
    TournamentOut,
    StageCreate,
    StageOut,
    StageScheduleRequest,
    StageScheduleResponse,
    StageScheduleMatchOut,
    StageStandingsOut,
    StageStandingOut,
    ParticipantOut,
)
from ..exceptions import http_problem
from ..services.tournaments import normalize_stage_type, schedule_americano
from .admin import require_admin

router = APIRouter()


@router.post("/tournaments", response_model=TournamentOut)
async def create_tournament(
    body: TournamentCreate, session: AsyncSession = Depends(get_session)
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
        raise http_problem(
            status_code=404,
            detail="tournament not found",
            code="tournament_not_found",
        )
    return TournamentOut(id=t.id, sport=t.sport_id, name=t.name, clubId=t.club_id)


@router.post("/tournaments/{tournament_id}/stages", response_model=StageOut)
async def create_stage(
    tournament_id: str, body: StageCreate, session: AsyncSession = Depends(get_session)
):
    t = await session.get(Tournament, tournament_id)
    if not t:
        raise http_problem(
            status_code=404,
            detail="tournament not found",
            code="tournament_not_found",
        )

    try:
        stage_type = normalize_stage_type(body.type)
    except ValueError as exc:
        raise http_problem(
            status_code=400,
            detail=str(exc),
            code="stage_type_unsupported",
        )

    sid = uuid.uuid4().hex
    s = Stage(
        id=sid,
        tournament_id=tournament_id,
        type=stage_type,
        config=body.config,
    )
    session.add(s)
    await session.commit()
    return StageOut(
        id=sid,
        tournamentId=tournament_id,
        type=stage_type,
        config=body.config,
    )


@router.get("/tournaments/{tournament_id}/stages", response_model=list[StageOut])
async def list_stages(tournament_id: str, session: AsyncSession = Depends(get_session)):
    rows = (
        await session.execute(select(Stage).where(Stage.tournament_id == tournament_id))
    ).scalars().all()
    return [
        StageOut(
            id=s.id,
            tournamentId=s.tournament_id,
            type=s.type,
            config=s.config,
        )
        for s in rows
    ]


@router.get(
    "/tournaments/{tournament_id}/stages/{stage_id}", response_model=StageOut
)
async def get_stage(
    tournament_id: str, stage_id: str, session: AsyncSession = Depends(get_session)
):
    s = await session.get(Stage, stage_id)
    if not s or s.tournament_id != tournament_id:
        raise http_problem(
            status_code=404,
            detail="stage not found",
            code="stage_not_found",
        )
    return StageOut(
        id=s.id,
        tournamentId=s.tournament_id,
        type=s.type,
        config=s.config,
    )


@router.post(
    "/tournaments/{tournament_id}/stages/{stage_id}/schedule",
    response_model=StageScheduleResponse,
)
async def schedule_stage(
    tournament_id: str,
    stage_id: str,
    body: StageScheduleRequest,
    session: AsyncSession = Depends(get_session),
    _admin=Depends(require_admin),
):
    stage = await session.get(Stage, stage_id)
    if not stage or stage.tournament_id != tournament_id:
        raise http_problem(
            status_code=404,
            detail="stage not found",
            code="stage_not_found",
        )

    tournament = await session.get(Tournament, tournament_id)
    if not tournament:
        raise http_problem(
            status_code=404,
            detail="tournament not found",
            code="tournament_not_found",
        )

    try:
        stage_type = normalize_stage_type(stage.type)
    except ValueError:
        stage_type = stage.type

    if stage_type != "americano":
        raise http_problem(
            status_code=400,
            detail="stage type does not support automatic scheduling",
            code="stage_schedule_unsupported",
        )

    try:
        created = await schedule_americano(
            stage.id,
            tournament.sport_id,
            body.playerIds,
            session,
            ruleset_id=body.rulesetId,
        )
    except ValueError as exc:
        raise http_problem(
            status_code=400,
            detail=str(exc),
            code="stage_schedule_invalid",
        )

    await session.commit()

    matches = [
        StageScheduleMatchOut(
            id=match.id,
            sport=match.sport_id,
            stageId=match.stage_id,
            rulesetId=match.ruleset_id,
            participants=[
                ParticipantOut(id=part.id, side=part.side, playerIds=part.player_ids)
                for part in participants
            ],
        )
        for match, participants in created
    ]

    return StageScheduleResponse(stageId=stage.id, matches=matches)


@router.get(
    "/tournaments/{tournament_id}/stages/{stage_id}/standings",
    response_model=StageStandingsOut,
)
async def get_stage_standings(
    tournament_id: str, stage_id: str, session: AsyncSession = Depends(get_session)
):
    stage = await session.get(Stage, stage_id)
    if not stage or stage.tournament_id != tournament_id:
        raise http_problem(
            status_code=404,
            detail="stage not found",
            code="stage_not_found",
        )

    standings = (
        await session.execute(
            select(StageStanding)
            .where(StageStanding.stage_id == stage_id)
            .order_by(
                StageStanding.points.desc(),
                StageStanding.points_diff.desc(),
                StageStanding.wins.desc(),
                StageStanding.player_id,
            )
        )
    ).scalars().all()

    return StageStandingsOut(
        stageId=stage.id,
        standings=[
            StageStandingOut(
                playerId=row.player_id,
                matchesPlayed=row.matches_played,
                wins=row.wins,
                losses=row.losses,
                draws=row.draws,
                pointsScored=row.points_scored,
                pointsAllowed=row.points_allowed,
                pointsDiff=row.points_diff,
                setsWon=row.sets_won,
                setsLost=row.sets_lost,
                points=row.points,
            )
            for row in standings
        ],
    )

