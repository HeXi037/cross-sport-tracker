import uuid
from pathlib import Path
from collections import defaultdict
from fastapi import APIRouter, Depends, Response, HTTPException, UploadFile, File, Query
from sqlalchemy import select, func, case, literal, true
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import aliased

from ..db import get_session
from ..models import (
    Player,
    Match,
    MatchParticipant,
    User,
    Comment,
    PlayerMetric,
    Badge,
    PlayerBadge,
)
from ..config import API_PREFIX
from ..schemas import (
    PlayerCreate,
    PlayerOut,
    PlayerListOut,
    PlayerNameOut,
    PlayerStatsOut,
    VersusRecord,
    BadgeOut,
    CommentCreate,
    CommentOut,
    SportFormatStats,
    StreakSummary,
)
from ..exceptions import ProblemDetail, PlayerAlreadyExists, PlayerNotFound
from ..services import (
    compute_streaks,
    rolling_win_percentage,
)
from .admin import require_admin
from .auth import get_current_user


UPLOAD_DIR = Path(__file__).resolve().parent.parent / "static" / "players"
UPLOAD_URL_PREFIX = f"{API_PREFIX}/static/players"
MAX_PHOTO_SIZE = 5 * 1024 * 1024  # 5MB limit on upload size
CHUNK_SIZE = 1024 * 1024  # 1MB chunks for streaming uploads
router = APIRouter(
    prefix="/players",
    tags=["players"],
    responses={400: {"model": ProblemDetail}, 404: {"model": ProblemDetail}},
)

@router.post("", response_model=PlayerOut)
async def create_player(
    body: PlayerCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(require_admin),
):
    exists = (
        await session.execute(select(Player).where(Player.name == body.name))
    ).scalar_one_or_none()
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
        badges=[],
    )

@router.get("", response_model=PlayerListOut)
async def list_players(
    q: str = "",
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_session),
):
    stmt = select(Player).where(Player.deleted_at.is_(None))
    count_stmt = select(func.count()).select_from(Player).where(
        Player.deleted_at.is_(None)
    )
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
            badges=[],
        )
        for p in rows
    ]
    return PlayerListOut(players=players, total=total, limit=limit, offset=offset)

@router.get("/by-ids", response_model=list[PlayerNameOut])
async def players_by_ids(ids: str = "", session: AsyncSession = Depends(get_session)):
    id_list = [i for i in ids.split(",") if i]
    if not id_list:
        return []
    rows = (
        await session.execute(
            select(Player).where(
                Player.id.in_(id_list), Player.deleted_at.is_(None)
            )
        )
    ).scalars().all()
    return [PlayerNameOut(id=p.id, name=p.name, photo_url=p.photo_url) for p in rows]

@router.get("/{player_id}", response_model=PlayerOut)
async def get_player(player_id: str, session: AsyncSession = Depends(get_session)):
    p = await session.get(Player, player_id)
    if not p or p.deleted_at is not None:
        raise PlayerNotFound(player_id)
    rows = (
        await session.execute(
            select(PlayerMetric).where(PlayerMetric.player_id == player_id)
        )
    ).scalars().all()
    metrics = {r.sport_id: r.metrics for r in rows}
    milestones = {r.sport_id: r.milestones for r in rows}
    try:
        badges = (
            await session.execute(
                select(Badge).join(PlayerBadge).where(PlayerBadge.player_id == player_id)
            )
        ).scalars().all()
    except SQLAlchemyError:
        badges = []
    return PlayerOut(
        id=p.id,
        name=p.name,
        club_id=p.club_id,
        photo_url=p.photo_url,
        location=p.location,
        ranking=p.ranking,
        metrics=metrics or None,
        milestones=milestones or None,
        badges=[BadgeOut(id=b.id, name=b.name, icon=b.icon) for b in badges],
    )


@router.post("/{player_id}/photo", response_model=PlayerNameOut)
async def upload_player_photo(
    player_id: str,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(require_admin),
):
    p = await session.get(Player, player_id)
    if not p or p.deleted_at is not None:
        raise PlayerNotFound(player_id)

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    suffix = Path(file.filename).suffix
    filename = f"{uuid.uuid4().hex}{suffix}"
    filepath = UPLOAD_DIR / filename
    size = 0
    with open(filepath, "wb") as f:
        while True:
            chunk = await file.read(CHUNK_SIZE)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_PHOTO_SIZE:
                f.close()
                filepath.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail="Uploaded file too large")
            f.write(chunk)

    p.photo_url = f"{UPLOAD_URL_PREFIX}/{filename}"
    await session.commit()
    return PlayerNameOut(id=p.id, name=p.name, photo_url=p.photo_url)

@router.post("/{player_id}/badges/{badge_id}", status_code=204)
async def add_badge_to_player(
    player_id: str,
    badge_id: str,
    session: AsyncSession = Depends(get_session),
):
    p = await session.get(Player, player_id)
    b = await session.get(Badge, badge_id)
    if not p or p.deleted_at is not None:
        raise PlayerNotFound(player_id)
    if not b:
        raise ProblemDetail(status_code=404, detail="badge not found")
    pb = PlayerBadge(id=uuid.uuid4().hex, player_id=player_id, badge_id=badge_id)
    session.add(pb)
    await session.commit()
    return Response(status_code=204)

@router.get("/{player_id}/comments", response_model=list[CommentOut])
async def list_comments(
    player_id: str, session: AsyncSession = Depends(get_session)
):
    p = await session.get(Player, player_id)
    if not p or p.deleted_at is not None:
        raise PlayerNotFound(player_id)
    stmt = (
        select(Comment, User.username)
        .join(User, Comment.user_id == User.id)
        .where(Comment.player_id == player_id, Comment.deleted_at.is_(None))
        .order_by(Comment.created_at)
    )
    rows = await session.execute(stmt)
    return [
        CommentOut(
            id=c.id,
            playerId=c.player_id,
            userId=c.user_id,
            username=u,
            content=c.content,
            createdAt=c.created_at,
        )
        for c, u in rows.all()
    ]

@router.post("/{player_id}/comments", response_model=CommentOut)
async def add_comment(
    player_id: str,
    body: CommentCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    p = await session.get(Player, player_id)
    if not p or p.deleted_at is not None:
        raise PlayerNotFound(player_id)
    cid = uuid.uuid4().hex
    comment = Comment(
        id=cid,
        player_id=player_id,
        user_id=user.id,
        content=body.content,
    )
    session.add(comment)
    await session.commit()
    await session.refresh(comment)
    return CommentOut(
        id=comment.id,
        playerId=comment.player_id,
        userId=comment.user_id,
        username=user.username,
        content=comment.content,
        createdAt=comment.created_at,
    )

@router.delete("/{player_id}/comments/{comment_id}", status_code=204)
async def delete_comment(
    player_id: str,
    comment_id: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    comment = await session.get(Comment, comment_id)
    if not comment or comment.player_id != player_id or comment.deleted_at is not None:
        raise HTTPException(status_code=404, detail="comment not found")
    if comment.user_id != user.id and not user.is_admin:
        raise HTTPException(status_code=403, detail="forbidden")
    comment.deleted_at = func.now()
    await session.commit()
    return Response(status_code=204)

@router.delete("/{player_id}", status_code=204)
async def delete_player(
    player_id: str,
    hard: bool = False,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(require_admin),
):
    p = await session.get(Player, player_id)
    if not p or p.deleted_at is not None:
        raise PlayerNotFound(player_id)

    if hard:
        # remove associated user so the username can be reused
        if p.user_id:
            u = await session.get(User, p.user_id)
            if u:
                await session.delete(u)
        await session.delete(p)
    else:
        p.deleted_at = func.now()

    await session.commit()
    return Response(status_code=204)


@router.get("/{player_id}/stats", response_model=PlayerStatsOut)
async def player_stats(
    player_id: str,
    span: int = 10,
    session: AsyncSession = Depends(get_session),
):
    p = await session.get(Player, player_id)
    if not p:
        raise PlayerNotFound(player_id)

    mp = aliased(MatchParticipant)
    self_ids = func.json_each(mp.player_ids).table_valued("value").alias("self_ids")

    a_sets = Match.details["sets"]["A"].as_integer()
    b_sets = Match.details["sets"]["B"].as_integer()
    winner = case((a_sets > b_sets, literal("A")), (b_sets > a_sets, literal("B")), else_=literal(None))
    is_win = case((winner == mp.side, 1), else_=0)

    pm = (
        select(
            Match.id.label("match_id"),
            Match.sport_id,
            Match.played_at,
            mp.id.label("mp_id"),
            mp.side,
            mp.player_ids,
            func.json_array_length(mp.player_ids).label("team_size"),
            is_win.label("is_win"),
        )
        .select_from(mp)
        .join(Match, Match.id == mp.match_id)
        .join(self_ids, true())
        .where(self_ids.c.value == player_id)
        .where(Match.deleted_at.is_(None))
    ).cte("pm")

    rows = (
        await session.execute(
            select(pm).order_by(pm.c.played_at, pm.c.match_id)
        )
    ).all()
    if not rows:
        return PlayerStatsOut(playerId=player_id)

    results = [bool(r.is_win) for r in rows]

    tm = func.json_each(pm.c.player_ids).table_valued("value").alias("tm")
    team_stmt = (
        select(
            tm.c.value.label("pid"),
            func.count().label("total"),
            func.sum(pm.c.is_win).label("wins"),
        )
        .select_from(pm)
        .join(tm, true())
        .where(tm.c.value != player_id)
        .group_by(tm.c.value)
    )
    opp_mp = aliased(MatchParticipant)
    opp_ids = func.json_each(opp_mp.player_ids).table_valued("value").alias("opp_ids")
    opp_stmt = (
        select(
            opp_ids.c.value.label("pid"),
            func.count().label("total"),
            func.sum(pm.c.is_win).label("wins"),
        )
        .select_from(pm)
        .join(opp_mp, opp_mp.match_id == pm.c.match_id)
        .join(opp_ids, true())
        .where(opp_mp.id != pm.c.mp_id)
        .group_by(opp_ids.c.value)
    )

    team_rows = (await session.execute(team_stmt)).all()
    opp_rows = (await session.execute(opp_stmt)).all()

    team_stats: dict[str, dict[str, int]] = {
        row.pid: {"wins": row.wins or 0, "total": row.total}
        for row in team_rows
    }
    opp_stats: dict[str, dict[str, int]] = {
        row.pid: {"wins": row.wins or 0, "total": row.total}
        for row in opp_rows
    }

    sf_stmt = (
        select(
            pm.c.sport_id,
            pm.c.team_size,
            func.count().label("total"),
            func.sum(pm.c.is_win).label("wins"),
        )
        .select_from(pm)
        .group_by(pm.c.sport_id, pm.c.team_size)
    )
    sf_rows = (await session.execute(sf_stmt)).all()
    sf_stats = []
    for row in sf_rows:
        wins = row.wins or 0
        total = row.total
        losses = total - wins
        win_pct = wins / total if total else 0.0
        sf_stats.append(
            SportFormatStats(
                sport=row.sport_id,
                format={1: "singles", 2: "doubles"}.get(row.team_size, f"{row.team_size}-player"),
                wins=wins,
                losses=losses,
                winPct=win_pct,
            )
        )

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
        with_records = records
    else:
        with_records = []

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
        withRecords=with_records,
        streaks=streaks,
    )
