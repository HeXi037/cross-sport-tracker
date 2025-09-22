"""Helpers for normalizing structured location fields."""

from __future__ import annotations

import re
from typing import Optional, Tuple

from .location_data import ISO3166_ALPHA2_CODES, COUNTRY_TO_CONTINENT

COUNTRY_CODE_RE = re.compile(r"^[A-Z]{2}$")
REGION_CODE_RE = re.compile(r"^[A-Z0-9]{1,3}$")
STRUCTURED_LOCATION_RE = re.compile(
    r"^(?P<country>[A-Z]{2})(?:[-_/:](?P<region>[A-Z0-9]{1,3}))?$"
)


def continent_for_country(country_code: Optional[str]) -> Optional[str]:
    """Return the continent code for a given ISO-3166 alpha-2 country."""

    if not country_code:
        return None
    return COUNTRY_TO_CONTINENT.get(country_code)


def normalize_country_code(
    value: Optional[str], *, raise_on_invalid: bool = False
) -> Optional[str]:
    """Normalize a country code to uppercase ISO-3166 alpha-2."""
    if value is None:
        return None
    if not isinstance(value, str):
        if raise_on_invalid:
            raise ValueError("country_code must be a string")
        return None
    normalized = value.strip().upper()
    if not normalized:
        return None
    if COUNTRY_CODE_RE.fullmatch(normalized) and normalized in ISO3166_ALPHA2_CODES:
        return normalized
    if raise_on_invalid:
        raise ValueError("country_code must be a valid ISO-3166 alpha-2 code")
    return None


def _strip_region_prefix(raw: str) -> str:
    for sep in ("-", "_", "/", ":"):
        if sep in raw:
            prefix, remainder = raw.split(sep, 1)
            if COUNTRY_CODE_RE.fullmatch(prefix):
                return remainder
    return raw


def normalize_region_code(
    value: Optional[str],
    *,
    country_code: Optional[str] = None,
    raise_on_invalid: bool = False,
) -> Optional[str]:
    """Normalize a region/subdivision code to uppercase alphanumeric."""
    if value is None:
        return None
    if not isinstance(value, str):
        if raise_on_invalid:
            raise ValueError("region_code must be a string")
        return None
    normalized = value.strip().upper()
    if not normalized:
        return None
    if country_code:
        prefix = f"{country_code}-"
        if normalized.startswith(prefix):
            normalized = normalized[len(prefix) :]
    normalized = _strip_region_prefix(normalized)
    if REGION_CODE_RE.fullmatch(normalized):
        return normalized
    if raise_on_invalid:
        raise ValueError("region_code must be 1-3 alphanumeric characters")
    return None


def parse_location_string(location: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    """Parse a structured location string into country/region codes."""
    if location is None or not isinstance(location, str):
        return None, None
    trimmed = location.strip()
    if not trimmed:
        return None, None
    match = STRUCTURED_LOCATION_RE.fullmatch(trimmed.upper())
    if match:
        return match.group("country"), match.group("region")
    return None, None


def compose_location_string(
    country_code: Optional[str], region_code: Optional[str]
) -> Optional[str]:
    """Compose a structured location string from normalized codes."""
    if not country_code:
        return None
    if region_code:
        return f"{country_code}-{region_code}"
    return country_code


def normalize_location_string(location: Optional[str]) -> Optional[str]:
    if location is None or not isinstance(location, str):
        return None
    trimmed = location.strip()
    return trimmed or None


def normalize_location_fields(
    location: Optional[str],
    country_code: Optional[str],
    region_code: Optional[str],
    *,
    raise_on_invalid: bool = False,
) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """Normalize a trio of location fields and keep them in sync."""
    normalized_location = normalize_location_string(location)
    normalized_country = normalize_country_code(
        country_code, raise_on_invalid=raise_on_invalid
    )
    normalized_region = normalize_region_code(
        region_code,
        country_code=normalized_country,
        raise_on_invalid=raise_on_invalid,
    )

    if normalized_location:
        loc_country, loc_region = parse_location_string(normalized_location)
        if loc_country and loc_country in ISO3166_ALPHA2_CODES:
            if normalized_country is None:
                normalized_country = loc_country
            if normalized_region is None:
                normalized_region = loc_region
            normalized_location = compose_location_string(
                normalized_country,
                normalized_region if normalized_region is not None else loc_region,
            )
        else:
            loc_country = None
            loc_region = None

    if not normalized_location and normalized_country:
        normalized_location = compose_location_string(
            normalized_country, normalized_region
        )

    if raise_on_invalid and normalized_region and not normalized_country:
        raise ValueError("region_code requires country_code")

    return normalized_location, normalized_country, normalized_region


__all__ = [
    "compose_location_string",
    "continent_for_country",
    "normalize_country_code",
    "normalize_location_fields",
    "normalize_location_string",
    "normalize_region_code",
    "parse_location_string",
]
