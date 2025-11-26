"""Helpers for working with database/SQLAlchemy errors."""

from __future__ import annotations

from sqlalchemy.exc import SQLAlchemyError

_MISSING_TABLE_SQLSTATES = {"42P01"}
_MISSING_COLUMN_SQLSTATES = {"42703"}


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


def is_missing_column_error(
    exc: SQLAlchemyError, column_identifier: str | None = None
) -> bool:
    """Return ``True`` if ``exc`` indicates that a column is missing.

    Parameters
    ----------
    exc:
        The SQLAlchemy exception to inspect.
    column_identifier:
        Optional substring (such as ``"badge."`` or ``"rule"``) that must be
        present in the original database error message. When omitted, any
        missing-column error will match.
    """

    orig = getattr(exc, "orig", None)
    if orig is None:
        return False

    sqlstate = getattr(orig, "sqlstate", None)
    if sqlstate in _MISSING_COLUMN_SQLSTATES:
        return True if column_identifier is None else column_identifier.lower() in str(orig).lower()

    message = str(orig).lower()
    if column_identifier and column_identifier.lower() not in message:
        return False

    return "column" in message and "does not exist" in message
