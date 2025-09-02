import uuid
from collections import defaultdict
from fastapi import APIRouter, Depends, Response
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import Player, Match, MatchParticipant, User
from ..schemas import (
    PlayerCreate,
    PlayerOut,
    PlayerListOut,
    PlayerNameOut,
    PlayerStatsOut,
    VersusRecord,
    SportFormatStats,
    StreakSummary,
)
from ..exceptions import ProblemDetail, PlayerAlreadyExists, PlayerNotFound
from ..services import (
    compute_sport_format_stats,
    compute_streaks,
    rolling_win_percentage,
)
from .admin import require_admin

# Resource-only prefix; versioning added in main.py
router = APIRouter(
    prefix="/players",
    tags=["players"],
    responses={400: {"model": ProblemDetail}, 404: {"model": ProblemDetail}},
)

# POST /api/v0/players
@router.post("", response_model=PlayerOut)
async def create_player(body: PlayerCreate, session: AsyncSession = Depends(get_session)):
    exists = (await session.execute(select(Player).where(Player.name == body.name))).scalar_one_or_none()
    if exists:
        raise PlayerAlreadyExists(body.name)
    pid = uuid.uuid4().hex
    p = Player(
        id=pid,
        name=body.name,
        club_id=body.club_id,
        photo_url=body.photo_url,
        location=body.location,
        ranking=body.ranking,
    )
    session.add(p)
    await session.commit()
    return PlayerOut(
        id=pid,
        name=p.name,
        club_id=p.club_id,
        photo_url=p.photo_url,
        location=p.location,
        ranking=p.ranking,
    )

# GET /api/v0/players
@router.get("", response_model=PlayerListOut)
async def list_players(
    q: str = "",
    limit: int = 50,
    offset: int = 0,
    session: AsyncSession = Depends(get_session),
):
    stmt = select(Player).where(Player.deleted_at.is_(None))
    count_stmt = select(func.count()).select_from(Player).where(Player.deleted_at.is_(None))
    if q:
        stmt = stmt.where(Player.name.ilike(f"%{q}%"))
        count_stmt = count_stmt.where(Player.name.ilike(f"%{q}%"))
    total = (await session.execute(count_stmt)).scalar()
    stmt = stmt.limit(limit).offset(offset)
    rows = (await session.execute(stmt)).scalars().all()
    players = [
        PlayerOut(
            id=p.id,
            name=p.name,
            club_id=p.club_id,
            photo_url=p.photo_url,
            location=p.location,
            ranking=p.ranking,
        )
        for p in rows
    ]
    return PlayerListOut(players=players, total=total, limit=limit, offset=offset)

# GET /api/v0/players/by-ids?ids=...
@router.get("/by-ids", response_model=list[PlayerNameOut])
async def players_by_ids(ids: str = "", session: AsyncSession = Depends(get_session)):
    id_list = [i for i in ids.split(",") if i]
    if not id_list:
        return []
    rows = (
        await session.execute(select(Player).where(Player.id.in_(id_list)))
    ).scalars().all()
    return [PlayerNameOut(id=p.id, name=p.name) for p in rows]

# GET /api/v0/players/{player_id}
@router.get("/{player_id}", response_model=PlayerOut)
async def get_player(player_id: str, session: AsyncSession = Depends(get_session)):
    p = await session.get(Player, player_id)
    if not p or p.deleted_at is not None:
        raise PlayerNotFound(player_id)
    return PlayerOut(
        id=p.id,
        name=p.name,
        club_id=p.club_id,
        photo_url=p.photo_url,
        location=p.location,
        ranking=p.ranking,
    )

# DELETE /api/v0/players/{player_id}
@router.delete("/{player_id}", status_code=204)
async def delete_player(
    player_id: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(require_admin),
):
    p = await session.get(Player, player_id)
    if not p or p.deleted_at is not None:
        raise PlayerNotFound(player_id)
    p.deleted_at = func.now()
    await session.commit()
    return Response(status_code=204)

def _winner_from_summary(summary: dict | None) -> str | None:
    if not summary:
        return None
    for key in ("sets", "points", "games", "total", "score"):
        val = summary.get(key)
        if isinstance(val, dict):
            a = val.get("A")
            b = val.get("B")
            if isinstance(a, (int, float)) and isinstance(b, (int, float)):
                if a > b:
                    return "A"
                if b > a:
                    return "B"
    return None

@router.get("/{player_id}/stats", response_model=PlayerStatsOut)
async def player_stats(
    player_id: str,
    span: int = 10,
    session: AsyncSession = Depends(get_session),
):
    p = await session.get(Player, player_id)
    if not p:
        raise PlayerNotFound(player_id)

    stmt = select(Match, MatchParticipant).join(MatchParticipant).where(Match.deleted_at.is_(None))
    rows = [
        r
        for r in (await session.execute(stmt)).all()
        if player_id in r.MatchParticipant.player_ids
    ]
    rows.sort(key=lambda r: (r.Match.played_at, r.Match.id))
    if not rows:
        return PlayerStatsOut(playerId=player_id)

    match_ids = [r.Match.id for r in rows]
    parts = (
        await session.execute(
            select(MatchParticipant).where(MatchParticipant.match_id.in_(match_ids))
        )
    ).scalars().all()
    match_to_parts = defaultdict(list)
    for part in parts:
        match_to_parts[part.match_id].append(part)

    opp_stats: dict[str, dict[str, int]] = defaultdict(lambda: {"wins": 0, "total": 0})
    team_stats: dict[str, dict[str, int]] = defaultdict(lambda: {"wins": 0, "total": 0})
    results: list[bool] = []
    match_summary: list[tuple[str, int, bool]] = []

    for row in rows:
        match, mp = row.Match, row.MatchParticipant
        winner = _winner_from_summary(match.details)
        if winner is None:
            continue
        is_win = winner == mp.side
        results.append(is_win)
        match_summary.append((match.sport_id, len(mp.player_ids), is_win))

        teammates = [pid for pid in mp.player_ids if pid != player_id]
        for tid in teammates:
            team_stats[tid]["total"] += 1
            if is_win:
                team_stats[tid]["wins"] += 1

        others = [p for p in match_to_parts[match.id] if p.id != mp.id]
        opp_ids = [pid for part in others for pid in part.player_ids]
        for oid in opp_ids:
            opp_stats[oid]["total"] += 1
            if is_win:
                opp_stats[oid]["wins"] += 1

    needed_ids = set(list(opp_stats.keys()) + list(team_stats.keys()))
    if needed_ids:
        players = (
            await session.execute(select(Player).where(Player.id.in_(needed_ids)))
        ).scalars().all()
        id_to_name = {pl.id: pl.name for pl in players}
    else:
        id_to_name = {}

    def to_record(pid: str, stats: dict[str, int]) -> VersusRecord:
        wins = stats["wins"]
        total = stats["total"]
        losses = total - wins
        win_pct = wins / total if total else 0.0
        return VersusRecord(
            playerId=pid,
            playerName=id_to_name.get(pid, ""),
            wins=wins,
            losses=losses,
            winPct=win_pct,
        )

    best_against = worst_against = best_with = worst_with = None
    if opp_stats:
        records = [to_record(pid, s) for pid, s in opp_stats.items()]
        best_against = max(records, key=lambda r: r.winPct)
        worst_against = min(records, key=lambda r: r.winPct)

    if team_stats:
        records = [to_record(pid, s) for pid, s in team_stats.items()]
        best_with = max(records, key=lambda r: r.winPct)
        worst_with = min(records, key=lambda r: r.winPct)

    sf_stats = [
        SportFormatStats(
            sport=s,
            format={1: "singles", 2: "doubles"}.get(t, f"{t}-player"),
            wins=val["wins"],
            losses=val["losses"],
            winPct=val["winPct"],
        )
        for (s, t), val in compute_sport_format_stats(match_summary).items()
    ]

    streak_info = compute_streaks(results)
    streaks = StreakSummary(**streak_info)

    rolling = rolling_win_percentage(results, span) if results else []

    return PlayerStatsOut(
        playerId=player_id,
        bestAgainst=best_against,
        worstAgainst=worst_against,
        bestWith=best_with,
        worstWith=worst_with,
        rollingWinPct=rolling,
        sportFormatStats=sf_stats,
        streaks=streaks,
    )
