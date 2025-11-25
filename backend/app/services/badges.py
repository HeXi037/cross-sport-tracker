"""Badge catalog management and auto-awarding logic."""

from __future__ import annotations

from dataclasses import dataclass
import uuid
from typing import Iterable

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import (
    Badge,
    GlickoRating,
    Match,
    MatchParticipant,
    MasterRating,
    PlayerBadge,
    PlayerMetric,
    Rating,
)


@dataclass
class BadgeDefinition:
    id: str
    name: str
    icon: str | None
    category: str
    rarity: str
    description: str | None
    sport_id: str | None
    rule: dict | None


BADGE_DEFINITIONS: list[BadgeDefinition] = [
    BadgeDefinition(
        id="padel_800",
        name="Padel 800+",
        icon="🎾",
        category="skill",
        rarity="epic",
        description="Reached an 800+ padel rating.",
        sport_id="padel",
        rule={"type": "rating_at_least", "threshold": 800, "sport_id": "padel"},
    ),
    BadgeDefinition(
        id="bowling_700",
        name="Bowling 700+",
        icon="🎳",
        category="skill",
        rarity="rare",
        description="Rolled into the 700+ club for bowling rating.",
        sport_id="bowling",
        rule={"type": "rating_at_least", "threshold": 700, "sport_id": "bowling"},
    ),
    BadgeDefinition(
        id="matches_50",
        name="Played 50 matches",
        icon="📅",
        category="milestone",
        rarity="common",
        description="Logged 50 competitive matches across all sports.",
        sport_id=None,
        rule={"type": "matches_played_at_least", "threshold": 50},
    ),
    BadgeDefinition(
        id="matches_100",
        name="Century Club",
        icon="💯",
        category="milestone",
        rarity="rare",
        description="Hit the 100 match milestone.",
        sport_id=None,
        rule={"type": "matches_played_at_least", "threshold": 100},
    ),
    BadgeDefinition(
        id="tournament_debut",
        name="First tournament",
        icon="🥁",
        category="milestone",
        rarity="common",
        description="Played a tournament match for the first time.",
        sport_id=None,
        rule={"type": "tournament_debut"},
    ),
    BadgeDefinition(
        id="all_rounder",
        name="All-rounder",
        icon="🧭",
        category="special",
        rarity="epic",
        description="Earned ratings in 3 or more sports.",
        sport_id=None,
        rule={"type": "distinct_rated_sports_at_least", "distinct_sports": 3},
    ),
    BadgeDefinition(
        id="perfect_game",
        name="Perfect game",
        icon="🌟",
        category="special",
        rarity="epic",
        description="Recorded a perfect performance milestone.",
        sport_id=None,
        rule={"type": "milestone", "milestone": "perfectGame"},
    ),
    BadgeDefinition(
        id="upset_win",
        name="Big upset win",
        icon="⚡",
        category="special",
        rarity="rare",
        description="Captured a signature upset victory milestone.",
        sport_id=None,
        rule={"type": "milestone", "milestone": "upsetWin"},
    ),
    BadgeDefinition(
        id="master_of_all_s1",
        name="Master of All (Season 1)",
        icon="🏆",
        category="special",
        rarity="legendary",
        description="Closed the season with a master-tier cross-sport rating.",
        sport_id=None,
        rule={"type": "master_rating_at_least", "threshold": 1800},
    ),
]


@dataclass
class PlayerBadgeSnapshot:
    player_id: str
    metrics: dict[str, dict]
    milestones: set[str]
    ratings: dict[str, float]
    master_rating: float | None
    total_matches: int
    played_tournament_match: bool

    @property
    def rated_sports(self) -> set[str]:
        return set(self.ratings.keys())


async def sync_badge_catalog(session: AsyncSession) -> None:
    existing = {
        b.id: b for b in (await session.execute(select(Badge))).scalars().all()
    }
    updated = False
    for definition in BADGE_DEFINITIONS:
        badge = existing.get(definition.id)
        if not badge:
            badge = Badge(
                id=definition.id,
                name=definition.name,
                icon=definition.icon,
                category=definition.category,
                rarity=definition.rarity,
                description=definition.description,
                sport_id=definition.sport_id,
                rule=definition.rule,
            )
            session.add(badge)
            updated = True
            continue

        for field in (
            "name",
            "icon",
            "category",
            "rarity",
            "description",
            "sport_id",
            "rule",
        ):
            new_value = getattr(definition, field)
            if getattr(badge, field) != new_value:
                setattr(badge, field, new_value)
                updated = True

    if updated:
        await session.commit()


async def _collect_snapshot(session: AsyncSession, player_id: str) -> PlayerBadgeSnapshot:
    metric_rows = (
        await session.execute(
            select(PlayerMetric).where(PlayerMetric.player_id == player_id)
        )
    ).scalars().all()
    metrics: dict[str, dict] = {}
    milestones: set[str] = set()
    total_matches = 0
    for row in metric_rows:
        metric_data = dict(row.metrics or {})
        metrics[row.sport_id] = metric_data
        total_matches += int(metric_data.get("matches", 0) or 0)
        milestones.update(set(row.milestones or []))

    rating_rows = (
        await session.execute(
            select(GlickoRating.sport_id, GlickoRating.rating).where(
                GlickoRating.player_id == player_id
            )
        )
    ).all()
    ratings = {sport_id: rating for sport_id, rating in rating_rows}
    if not ratings:
        fallback_ratings = (
            await session.execute(
                select(Rating.sport_id, Rating.value).where(Rating.player_id == player_id)
            )
        ).all()
        ratings = {sport_id: value for sport_id, value in fallback_ratings}

    master_rating_row = (
        await session.execute(
            select(MasterRating.value).where(MasterRating.player_id == player_id)
        )
    ).scalar_one_or_none()

    tournament_play = (
        await session.execute(
            select(func.count())
            .select_from(MatchParticipant)
            .join(Match, MatchParticipant.match_id == Match.id)
            .where(
                MatchParticipant.player_ids.contains([player_id]),
                Match.stage_id.is_not(None),
            )
        )
    ).scalar_one()

    return PlayerBadgeSnapshot(
        player_id=player_id,
        metrics=metrics,
        milestones=milestones,
        ratings=ratings,
        master_rating=master_rating_row,
        total_matches=total_matches,
        played_tournament_match=bool(tournament_play),
    )


def _rule_matches(rule: dict | None, snapshot: PlayerBadgeSnapshot) -> bool:
    if not rule:
        return False
    rule_type = rule.get("type")
    if rule_type == "rating_at_least":
        threshold = float(rule.get("threshold") or 0)
        sport_id = rule.get("sport_id")
        rating = snapshot.ratings.get(sport_id) if sport_id else None
        return rating is not None and rating >= threshold
    if rule_type == "matches_played_at_least":
        threshold = int(rule.get("threshold") or 0)
        return snapshot.total_matches >= threshold
    if rule_type == "sport_matches_at_least":
        sport_id = rule.get("sport_id")
        if not sport_id:
            return False
        threshold = int(rule.get("threshold") or 0)
        return int(snapshot.metrics.get(sport_id, {}).get("matches", 0) or 0) >= threshold
    if rule_type == "distinct_rated_sports_at_least":
        threshold = int(rule.get("distinct_sports") or 0)
        return len(snapshot.rated_sports) >= threshold
    if rule_type == "milestone":
        milestone = rule.get("milestone")
        return bool(milestone and milestone in snapshot.milestones)
    if rule_type == "tournament_debut":
        return snapshot.played_tournament_match
    if rule_type == "master_rating_at_least":
        threshold = float(rule.get("threshold") or 0)
        return snapshot.master_rating is not None and snapshot.master_rating >= threshold
    return False


async def award_badges_for_player(
    session: AsyncSession, player_id: str, definitions: Iterable[BadgeDefinition] | None = None
) -> None:
    badge_definitions = list(definitions or BADGE_DEFINITIONS)
    snapshot = await _collect_snapshot(session, player_id)
    existing_badges = {
        row.badge_id: row
        for row in (
            await session.execute(
                select(PlayerBadge).where(PlayerBadge.player_id == player_id)
            )
        ).scalars()
    }

    awarded = False
    for definition in badge_definitions:
        if not _rule_matches(definition.rule, snapshot):
            continue
        if definition.id in existing_badges:
            continue
        session.add(
            PlayerBadge(
                id=uuid.uuid4().hex,
                player_id=player_id,
                badge_id=definition.id,
            )
        )
        awarded = True

    if awarded:
        await session.commit()


async def load_player_badges(session: AsyncSession, player_id: str) -> list[tuple[PlayerBadge, Badge]]:
    rows = (
        await session.execute(
            select(PlayerBadge, Badge)
            .join(Badge, Badge.id == PlayerBadge.badge_id)
            .where(PlayerBadge.player_id == player_id)
            .order_by(PlayerBadge.earned_at.desc())
        )
    ).all()
    return rows


async def ensure_player_badges(
    session: AsyncSession, player_id: str, *, auto_award: bool = True
) -> list[tuple[PlayerBadge, Badge]]:
    await sync_badge_catalog(session)
    if auto_award:
        await award_badges_for_player(session, player_id)
    return await load_player_badges(session, player_id)


async def ensure_badges_for_players(
    session: AsyncSession, player_ids: Iterable[str], *, auto_award: bool = True
) -> dict[str, list[tuple[PlayerBadge, Badge]]]:
    await sync_badge_catalog(session)
    results: dict[str, list[tuple[PlayerBadge, Badge]]] = {}
    for pid in player_ids:
        if auto_award:
            await award_badges_for_player(session, pid)
        results[pid] = await load_player_badges(session, pid)
    return results
