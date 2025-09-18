#!/usr/bin/env python3
"""Admin helper to update structured player location fields."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
from dataclasses import asdict, dataclass
from typing import Any, Dict, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.location_utils import normalize_location_fields


@dataclass
class PlayerLocation:
    id: str
    name: str
    location: Optional[str]
    country_code: Optional[str]
    region_code: Optional[str]

    @classmethod
    def from_row(cls, row: Any) -> "PlayerLocation":
        return cls(
            id=row.id,
            name=row.name,
            location=row.location,
            country_code=row.country_code,
            region_code=row.region_code,
        )


async def _get_engine() -> AsyncEngine:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL environment variable is required")
    if database_url.startswith("postgresql://"):
        database_url = database_url.replace(
            "postgresql://", "postgresql+asyncpg://", 1
        )
    return create_async_engine(database_url, echo=False, pool_pre_ping=True)


async def _load_player(session: AsyncSession, player_id: str) -> PlayerLocation:
    result = await session.execute(
        text(
            """
            SELECT id, name, location, country_code, region_code
            FROM player
            WHERE id = :player_id
            """
        ),
        {"player_id": player_id},
    )
    row = result.one_or_none()
    if row is None:
        raise RuntimeError(f"Player '{player_id}' not found")
    return PlayerLocation.from_row(row)


def _normalize_inputs(
    existing: PlayerLocation,
    *,
    location: Optional[str],
    country_code: Optional[str],
    region_code: Optional[str],
) -> PlayerLocation:
    target_location = existing.location if location is None else location
    target_country = existing.country_code if country_code is None else country_code
    target_region = existing.region_code if region_code is None else region_code

    normalized_location, normalized_country, normalized_region = normalize_location_fields(
        target_location,
        target_country,
        target_region,
        raise_on_invalid=True,
    )

    return PlayerLocation(
        id=existing.id,
        name=existing.name,
        location=normalized_location,
        country_code=normalized_country,
        region_code=normalized_region,
    )


def _detect_changes(
    before: PlayerLocation, after: PlayerLocation
) -> Dict[str, Optional[str]]:
    updates: Dict[str, Optional[str]] = {}
    if before.location != after.location:
        updates["location"] = after.location
    if before.country_code != after.country_code:
        updates["country_code"] = after.country_code
    if before.region_code != after.region_code:
        updates["region_code"] = after.region_code
    return updates


async def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Update the structured location fields for a player while keeping the "
            "free-form location string in sync."
        )
    )
    parser.add_argument("player_id", help="Identifier of the player to update")
    parser.add_argument(
        "--location",
        help="Free-form location text. Provide an empty string to clear the value.",
    )
    parser.add_argument(
        "--country-code",
        help="ISO-3166 alpha-2 country code. Provide an empty string to clear the value.",
    )
    parser.add_argument(
        "--region-code",
        help="Optional region/subdivision code. Provide an empty string to clear the value.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show the proposed changes without writing them to the database.",
    )

    args = parser.parse_args()

    if (
        args.location is None
        and args.country_code is None
        and args.region_code is None
    ):
        parser.error("At least one of --location, --country-code, or --region-code is required")

    engine = await _get_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with Session() as session:
            before = await _load_player(session, args.player_id)
            after = _normalize_inputs(
                before,
                location=args.location,
                country_code=args.country_code,
                region_code=args.region_code,
            )
            updates = _detect_changes(before, after)

            print("Before:")
            print(json.dumps(asdict(before), indent=2, sort_keys=True))
            print("After:")
            print(json.dumps(asdict(after), indent=2, sort_keys=True))

            if not updates:
                print("No changes detected; nothing to do.")
                return

            if args.dry_run:
                print("Dry run; no updates written.")
                return

            await session.execute(
                text(
                    """
                    UPDATE player
                    SET location = :location,
                        country_code = :country_code,
                        region_code = :region_code
                    WHERE id = :player_id
                    """
                ),
                {
                    "player_id": before.id,
                    "location": updates.get("location", before.location),
                    "country_code": updates.get("country_code", before.country_code),
                    "region_code": updates.get("region_code", before.region_code),
                },
            )
            await session.commit()
            print("Update applied.")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
