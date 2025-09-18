#!/usr/bin/env python3
"""Helper script to survey distinct player.location values.

Run with DATABASE_URL pointing at the production database::

    DATABASE_URL=postgresql://... python backend/scripts/survey_player_locations.py

The script prints a JSON document containing the distinct location strings,
counts, and whether the current normalization helpers consider them structured.
"""

from __future__ import annotations

import asyncio
import json
import os
from dataclasses import dataclass, asdict
from typing import Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from app.location_utils import parse_location_string, normalize_location_string


@dataclass
class LocationSample:
    location: str
    count: int
    normalized: Optional[str]
    structured_country: Optional[str]
    structured_region: Optional[str]


async def _gather_samples(engine: AsyncEngine) -> list[LocationSample]:
    async with engine.connect() as conn:
        result = await conn.execute(
            text(
                """
                SELECT location, COUNT(*) AS count
                FROM player
                WHERE location IS NOT NULL
                  AND TRIM(location) <> ''
                GROUP BY location
                ORDER BY COUNT(*) DESC, location
                """
            )
        )
        rows = result.fetchall()

    samples: list[LocationSample] = []
    for raw_location, count in rows:
        normalized = normalize_location_string(raw_location)
        if normalized is None:
            normalized = raw_location
        country, region = parse_location_string(normalized)
        samples.append(
            LocationSample(
                location=raw_location,
                count=count,
                normalized=normalized,
                structured_country=country,
                structured_region=region,
            )
        )
    return samples


async def main() -> None:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL environment variable is required")

    if database_url.startswith("postgresql://"):
        database_url = database_url.replace(
            "postgresql://", "postgresql+asyncpg://", 1
        )

    engine = create_async_engine(database_url, echo=False, pool_pre_ping=True)
    try:
        samples = await _gather_samples(engine)
    finally:
        await engine.dispose()

    print(json.dumps([asdict(sample) for sample in samples], indent=2, sort_keys=True))


if __name__ == "__main__":
    asyncio.run(main())
