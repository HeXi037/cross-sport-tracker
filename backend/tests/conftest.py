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
# Force tests to use an in-memory SQLite database
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"

@pytest.fixture(autouse=True)
def jwt_secret(monkeypatch):
    """Ensure a strong JWT secret is present for all tests."""
    monkeypatch.setenv("JWT_SECRET", TEST_JWT_SECRET)
    yield


@pytest.fixture(autouse=True, scope="module")
def ensure_database():
    """Ensure each test module starts with a clean in-memory database."""

    mp = pytest.MonkeyPatch()
    mp.setenv("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
    db.engine = None
    db.AsyncSessionLocal = None
    yield
    mp.undo()


async def _create_schema(engine) -> None:
    """Create all database tables for the given engine."""

    async with engine.begin() as conn:
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

    desired_url: Optional[str] = os.getenv("DATABASE_URL")
    if desired_url and (
        db.engine is None
        or db.AsyncSessionLocal is None
        or str(db.engine.url) != desired_url
    ):
        # Recreate engine/session for the desired URL and build schema
        db.engine = None
        db.AsyncSessionLocal = None
        engine = db.get_engine()
        asyncio.run(_create_schema(engine))

    yield

    if request.node.get_closest_marker("preserve_db"):
        return

    # Reset global engine/session so the next module starts with a clean slate
    db.engine = None
    db.AsyncSessionLocal = None
