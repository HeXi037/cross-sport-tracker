"""Helpers for working with timezone-aware datetimes."""

from __future__ import annotations

from datetime import datetime, timezone


def require_utc(value: datetime | None, *, field_name: str = "timestamp") -> datetime | None:
    """Ensure ``value`` includes timezone info and return a UTC-normalized copy.

    Args:
        value: The datetime to validate.
        field_name: Human-readable name used in validation errors.

    Returns:
        A timezone-aware datetime normalized to UTC, or ``None`` if ``value`` is
        ``None``.

    Raises:
        ValueError: If ``value`` is timezone-naive.
    """

    if value is None:
        return None

    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError(f"{field_name} must include a timezone offset")

    return value.astimezone(timezone.utc)


def coerce_utc(value: datetime | None) -> datetime | None:
    """Return a UTC-normalized datetime, assuming naive values are already UTC."""

    if value is None:
        return None

    if value.tzinfo is None or value.utcoffset() is None:
        return value.replace(tzinfo=timezone.utc)

    return value.astimezone(timezone.utc)
