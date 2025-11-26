import os
import sys
import asyncio
from typing import Optional

import pytest

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Ensure all SQLAlchemy models are registered with the declarative Base so
# metadata.create_all creates every table (including optional ones like
# glicko_rating and player_metric) when the test database is initialised.
from app import db, models  # noqa: F401

# A sufficiently long JWT secret for tests
TEST_JWT_SECRET = "x" * 32
os.environ.setdefault("JWT_SECRET", TEST_JWT_SECRET)
# Honour any externally provided DATABASE_URL (e.g. CI may set a file-backed DB)
# but fall back to an in-memory SQLite database so local runs remain isolated.
DEFAULT_DB_URL = os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")

@pytest.fixture(autouse=True)
def jwt_secret(monkeypatch):
    """Ensure a strong JWT secret is present for all tests."""
    monkeypatch.setenv("JWT_SECRET", TEST_JWT_SECRET)
    yield


@pytest.fixture(autouse=True, scope="module")
def ensure_database():
    """Ensure each test module starts with a clean database connection."""

    mp = pytest.MonkeyPatch()
    desired_url = os.getenv("DATABASE_URL") or DEFAULT_DB_URL
    mp.setenv("DATABASE_URL", desired_url)
    db.engine = None
    db.AsyncSessionLocal = None
    yield
    mp.undo()


async def _rebuild_schema(engine) -> None:
    """Drop and recreate all database tables for the given engine.

    Dropping first ensures file-backed databases used in CI do not retain data
    between test modules, preventing ``IntegrityError`` failures from duplicate
    inserts (for example, on unique sport names or player IDs).
    """

    async with engine.begin() as conn:
        await conn.run_sync(db.Base.metadata.drop_all)
        await conn.run_sync(db.Base.metadata.create_all)


@pytest.fixture(autouse=True, scope="module")
def ensure_schema(request, ensure_database):
    """Rebuild database schema if the engine/session have been reset.

    This fixture checks whether ``db.engine`` or ``db.AsyncSessionLocal`` have
    been cleared or point to a different database URL. If so, it recreates the
    engine and rebuilds the full schema. Modules that wish to keep their
    database across tests can apply the ``@pytest.mark.preserve_db`` marker to
    opt out of the final reset.
    """

    desired_url: Optional[str] = os.getenv("DATABASE_URL") or DEFAULT_DB_URL
    if desired_url and (
        db.engine is None
        or db.AsyncSessionLocal is None
        or str(db.engine.url) != desired_url
    ):
        # Recreate engine/session for the desired URL
        db.engine = None
        db.AsyncSessionLocal = None
        engine = db.get_engine()
    else:
        engine = db.engine

    if engine is not None:
        asyncio.run(_rebuild_schema(engine))

    yield

    if request.node.get_closest_marker("preserve_db"):
        return

    # Reset global engine/session so the next module starts with a clean slate
    db.engine = None
    db.AsyncSessionLocal = None
