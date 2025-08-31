from collections import defaultdict

from fastapi import APIRouter, Query, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import Rating, Player, Match, MatchParticipant, ScoreEvent
from ..schemas import LeaderboardEntryOut, LeaderboardOut

# Resource-only prefix; no /api or /api/v0 here
router = APIRouter(prefix="/leaderboards", tags=["leaderboards"])


# GET /api/v0/leaderboards?sport=padel
@router.get("", response_model=LeaderboardOut)
async def leaderboard(
    sport: str = Query(..., description="Sport id, e.g. 'padel' or 'bowling'"),
    limit: int = 50,
    offset: int = 0,
    session: AsyncSession = Depends(get_session),
):
    stmt = (
        select(Rating, Player)
        .join(Player, Player.id == Rating.player_id)
        .where(Rating.sport_id == sport, Player.deleted_at.is_(None))
        .order_by(Rating.value.desc())
    )
    # Fetch all rows so we can compute ranks and previous ranks.
    all_rows = (await session.execute(stmt)).all()
    total = len(all_rows)
    # Map player_id -> current rank and rating
    current_rank_map = {
        row.Rating.player_id: i + 1 for i, row in enumerate(all_rows)
    }
    current_rating_map = {
        row.Rating.player_id: row.Rating.value for row in all_rows
    }
    rows = all_rows[offset : offset + limit]

    # Precompute set stats for players returned by the ranking query.
    player_ids = [r.Rating.player_id for r in rows]
    set_stats = {pid: {"won": 0, "lost": 0} for pid in player_ids}

    if player_ids:
        mp_rows = (
            await session.execute(
                select(MatchParticipant, Match)
                .join(Match, Match.id == MatchParticipant.match_id)
                .where(Match.sport_id == sport, Match.deleted_at.is_(None))
            )
        ).all()
        for mp, m in mp_rows:
            if not m.details or "sets" not in m.details:
                continue
            sets = m.details.get("sets", {})
            won = sets.get(mp.side, 0)
            opp = "B" if mp.side == "A" else "A"
            lost = sets.get(opp, 0)
            for pid in mp.player_ids:
                if pid in set_stats:
                    set_stats[pid]["won"] += won
                    set_stats[pid]["lost"] += lost

    # Build rating history for the sport using RATING score events
    rating_events = (
        await session.execute(
            select(ScoreEvent)
            .join(Match, Match.id == ScoreEvent.match_id)
            .where(Match.sport_id == sport, ScoreEvent.type == "RATING")
            .order_by(ScoreEvent.created_at)
        )
    ).scalars().all()
    histories = defaultdict(list)
    for ev in rating_events:
        payload = ev.payload or {}
        pid = payload.get("playerId")
        rating = payload.get("rating")
        if pid is not None and rating is not None:
            histories[pid].append(rating)

    prev_ratings = {}
    for pid, curr in current_rating_map.items():
        hist = histories.get(pid, [])
        if len(hist) > 5:
            prev_ratings[pid] = hist[-6]
        else:
            prev_ratings[pid] = curr
    prev_sorted = sorted(prev_ratings.items(), key=lambda kv: kv[1], reverse=True)
    prev_rank_map = {pid: i + 1 for i, (pid, _) in enumerate(prev_sorted)}

    leaders = []
    for r in rows:
        pid = r.Rating.player_id
        stats = set_stats.get(pid, {"won": 0, "lost": 0})
        won = stats["won"]
        lost = stats["lost"]
        curr_rank = current_rank_map[pid]
        prev_rank = prev_rank_map.get(pid, curr_rank)
        leaders.append(
            LeaderboardEntryOut(
                rank=curr_rank,
                playerId=pid,
                playerName=r.Player.name,
                rating=r.Rating.value,
                rankChange=prev_rank - curr_rank,
                sets=won + lost,
                setsWon=won,
                setsLost=lost,
                setDiff=won - lost,
            )
        )

    return LeaderboardOut(
        sport=sport, leaders=leaders, total=total, limit=limit, offset=offset
    )
