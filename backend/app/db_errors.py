"""Helpers for working with database/SQLAlchemy errors."""

from __future__ import annotations

from sqlalchemy.exc import SQLAlchemyError

_MISSING_TABLE_SQLSTATES = {"42P01"}


def is_missing_table_error(exc: SQLAlchemyError, table_name: str) -> bool:
    """Return ``True`` if ``exc`` indicates that ``table_name`` is missing."""

    orig = getattr(exc, "orig", None)
    if orig is None:
        return False

    sqlstate = getattr(orig, "sqlstate", None)
    if sqlstate in _MISSING_TABLE_SQLSTATES:
        return True

    message = str(orig).lower()
    if table_name.lower() not in message:
        return False

    return "no such table" in message or "does not exist" in message
