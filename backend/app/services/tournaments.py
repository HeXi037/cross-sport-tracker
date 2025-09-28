"""Helpers for tournament and stage orchestration."""

from __future__ import annotations

import uuid
from typing import Iterable, Sequence

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import (
    Match,
    MatchParticipant,
    Player,
    RuleSet,
    StageStanding,
)


SUPPORTED_STAGE_TYPES = {"round_robin", "single_elim", "americano"}


def normalize_stage_type(stage_type: str) -> str:
    """Normalize and validate a stage type identifier."""

    value = (stage_type or "").strip().lower()
    if value not in SUPPORTED_STAGE_TYPES:
        raise ValueError(f"unsupported stage type: {stage_type!r}")
    return value


async def _resolve_ruleset(
    session: AsyncSession, sport_id: str, preferred_ruleset: str | None
) -> str:
    if preferred_ruleset:
        ruleset = await session.get(RuleSet, preferred_ruleset)
        if not ruleset or ruleset.sport_id != sport_id:
            raise ValueError("ruleset does not match sport")
        return ruleset.id

    result = await session.execute(
        select(RuleSet.id).where(RuleSet.sport_id == sport_id).order_by(RuleSet.id)
    )
    ruleset_id = result.scalars().first()
    if not ruleset_id:
        raise ValueError(f"no ruleset configured for sport {sport_id!r}")
    return ruleset_id


def _unique_player_ids(player_ids: Iterable[str]) -> list[str]:
    seen: dict[str, None] = {}
    for pid in player_ids:
        if not pid:
            continue
        if pid in seen:
            raise ValueError("duplicate player ids provided")
        seen[pid] = None
    return list(seen.keys())


async def schedule_americano(
    stage_id: str,
    sport_id: str,
    player_ids: Sequence[str],
    session: AsyncSession,
    *,
    ruleset_id: str | None = None,
) -> list[tuple[Match, list[MatchParticipant]]]:
    """Create Americano pairings for a stage.

    Players are grouped into sets of four and scheduled so the first two face
    the second two. The function raises ``ValueError`` if the stage already has
    matches, if any player ids are unknown, or if the player list is not a
    multiple of four competitors.
    """

    unique_players = _unique_player_ids(player_ids)
    if len(unique_players) < 4 or len(unique_players) % 4 != 0:
        raise ValueError(
            "Americano scheduling requires groups of four players"
        )

    existing_match = (
        await session.execute(
            select(Match.id).where(
                Match.stage_id == stage_id,
                Match.deleted_at.is_(None),
            )
        )
    ).scalars().first()
    if existing_match:
        raise ValueError("stage already has scheduled matches")

    registered = (
        await session.execute(
            select(Player.id).where(Player.id.in_(unique_players))
        )
    ).scalars().all()
    missing = sorted(set(unique_players) - set(registered))
    if missing:
        raise ValueError(f"unknown players: {', '.join(missing)}")

    resolved_ruleset = await _resolve_ruleset(session, sport_id, ruleset_id)

    created: list[tuple[Match, list[MatchParticipant]]] = []
    for index in range(0, len(unique_players), 4):
        group = unique_players[index : index + 4]
        match_id = uuid.uuid4().hex
        match = Match(
            id=match_id,
            sport_id=sport_id,
            stage_id=stage_id,
            ruleset_id=resolved_ruleset,
            best_of=None,
            played_at=None,
            location=None,
            details=None,
            is_friendly=False,
        )
        session.add(match)

        participants: list[MatchParticipant] = []
        for side, players in zip(("A", "B"), (group[:2], group[2:])):
            participant = MatchParticipant(
                id=uuid.uuid4().hex,
                match_id=match_id,
                side=side,
                player_ids=list(players),
            )
            session.add(participant)
            participants.append(participant)

        created.append((match, participants))

    await session.flush()
    await recompute_stage_standings(stage_id, session)
    return created


def _default_stats() -> dict[str, int]:
    return {
        "matches_played": 0,
        "wins": 0,
        "losses": 0,
        "draws": 0,
        "points_scored": 0,
        "points_allowed": 0,
        "sets_won": 0,
        "sets_lost": 0,
    }


async def recompute_stage_standings(
    stage_id: str, session: AsyncSession
) -> list[StageStanding]:
    """Rebuild the ``StageStanding`` rows for a stage."""

    matches = (
        await session.execute(
            select(Match).where(
                Match.stage_id == stage_id,
                Match.deleted_at.is_(None),
            )
        )
    ).scalars().all()

    await session.execute(
        delete(StageStanding).where(StageStanding.stage_id == stage_id)
    )

    if not matches:
        return []

    match_ids = [m.id for m in matches]
    participants = (
        await session.execute(
            select(MatchParticipant).where(MatchParticipant.match_id.in_(match_ids))
        )
    ).scalars().all()

    participants_by_match: dict[str, list[MatchParticipant]] = {}
    for participant in participants:
        participants_by_match.setdefault(participant.match_id, []).append(participant)

    stats: dict[str, dict[str, int]] = {}
    players_in_stage: set[str] = set()

    def _to_int(value: object) -> int:
        try:
            return int(value)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return 0

    for match in matches:
        parts = participants_by_match.get(match.id, [])
        players_a = [
            pid
            for part in parts
            if part.side == "A"
            for pid in (part.player_ids or [])
        ]
        players_b = [
            pid
            for part in parts
            if part.side == "B"
            for pid in (part.player_ids or [])
        ]
        players_in_stage.update(players_a)
        players_in_stage.update(players_b)

        if not players_a or not players_b:
            continue

        summary = match.details if isinstance(match.details, dict) else None
        if not summary:
            continue

        score = summary.get("score") if isinstance(summary, dict) else None
        a_score = b_score = 0
        if isinstance(score, dict):
            a_score = _to_int(score.get("A"))
            b_score = _to_int(score.get("B"))

        if a_score == 0 and b_score == 0:
            set_scores = summary.get("set_scores") if isinstance(summary, dict) else None
            if isinstance(set_scores, list):
                a_score = sum(_to_int((entry or {}).get("A")) for entry in set_scores)
                b_score = sum(_to_int((entry or {}).get("B")) for entry in set_scores)

        sets = summary.get("sets") if isinstance(summary, dict) else None
        if isinstance(sets, dict):
            a_sets = _to_int(sets.get("A"))
            b_sets = _to_int(sets.get("B"))
        else:
            a_sets = b_sets = 0

        result: str | None
        if a_sets or b_sets:
            if a_sets > b_sets:
                result = "A"
            elif b_sets > a_sets:
                result = "B"
            else:
                result = "draw"
        elif a_score or b_score:
            if a_score > b_score:
                result = "A"
            elif b_score > a_score:
                result = "B"
            else:
                result = "draw"
        else:
            result = None

        for pid in players_a:
            player_stats = stats.setdefault(pid, _default_stats())
            player_stats["matches_played"] += 1
            player_stats["points_scored"] += a_score
            player_stats["points_allowed"] += b_score
            player_stats["sets_won"] += a_sets
            player_stats["sets_lost"] += b_sets
            if result == "A":
                player_stats["wins"] += 1
            elif result == "B":
                player_stats["losses"] += 1
            elif result == "draw":
                player_stats["draws"] += 1

        for pid in players_b:
            player_stats = stats.setdefault(pid, _default_stats())
            player_stats["matches_played"] += 1
            player_stats["points_scored"] += b_score
            player_stats["points_allowed"] += a_score
            player_stats["sets_won"] += b_sets
            player_stats["sets_lost"] += a_sets
            if result == "B":
                player_stats["wins"] += 1
            elif result == "A":
                player_stats["losses"] += 1
            elif result == "draw":
                player_stats["draws"] += 1

    for pid in players_in_stage:
        stats.setdefault(pid, _default_stats())

    standings: list[StageStanding] = []
    for pid in sorted(stats):
        values = stats[pid]
        points_diff = values["points_scored"] - values["points_allowed"]
        points = values["wins"] * 3 + values["draws"]
        standing = StageStanding(
            stage_id=stage_id,
            player_id=pid,
            matches_played=values["matches_played"],
            wins=values["wins"],
            losses=values["losses"],
            draws=values["draws"],
            points_scored=values["points_scored"],
            points_allowed=values["points_allowed"],
            points_diff=points_diff,
            sets_won=values["sets_won"],
            sets_lost=values["sets_lost"],
            points=points,
        )
        session.add(standing)
        standings.append(standing)

    return standings
