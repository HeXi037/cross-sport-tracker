from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import Sport
from ..schemas import SportOut

router = APIRouter(prefix="/sports", tags=["sports"])


DEFAULT_SPORT_CATALOG: tuple[tuple[str, str], ...] = (
    ("padel", "Padel"),
    ("padel_americano", "Padel Americano"),
    ("bowling", "Bowling"),
    ("tennis", "Tennis"),
    ("pickleball", "Pickleball"),
    ("table_tennis", "Table Tennis"),
    ("disc_golf", "Disc Golf"),
)

DEFAULT_SPORT_NAME_LOOKUP = {sport_id: name for sport_id, name in DEFAULT_SPORT_CATALOG}


def _fallback_sport_name(sport_id: str, provided_name: str | None) -> str:
    if provided_name:
        normalized = provided_name.strip()
        if normalized:
            return normalized

    fallback = DEFAULT_SPORT_NAME_LOOKUP.get(sport_id)
    if fallback:
        return fallback

    normalized_id = sport_id.replace("_", " ").replace("-", " ").strip()
    if not normalized_id:
        return sport_id

    return normalized_id.title()


# GET /api/v0/sports
@router.get("", response_model=list[SportOut])  # or use "/" — both work as the router's root
async def list_sports(session: AsyncSession = Depends(get_session)) -> list[SportOut]:
    rows = (await session.execute(select(Sport))).scalars().all()

    catalog: dict[str, str] = {}
    for sport in rows:
        catalog[sport.id] = _fallback_sport_name(sport.id, sport.name)

    for sport_id, name in DEFAULT_SPORT_CATALOG:
        catalog.setdefault(sport_id, name)

    # Return a deterministic ordering for consumers
    sorted_catalog = sorted(
        catalog.items(), key=lambda item: (item[1].lower(), item[0])
    )

    return [SportOut(id=sport_id, name=name) for sport_id, name in sorted_catalog]
