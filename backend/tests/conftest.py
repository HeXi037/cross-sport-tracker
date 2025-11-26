import os
import sys
import asyncio

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


@pytest.fixture(autouse=True, scope="session")
def ensure_database():
    """Ensure the test database starts clean and honours DATABASE_URL."""

    mp = pytest.MonkeyPatch()
    desired_url = os.getenv("DATABASE_URL") or DEFAULT_DB_URL
    mp.setenv("DATABASE_URL", desired_url)

    if desired_url.startswith("sqlite") and ":memory:" not in desired_url:
        path = desired_url.split("///")[-1]
        if os.path.exists(path):
            os.remove(path)

    db.engine = None
    db.AsyncSessionLocal = None
    yield
    mp.undo()


async def _reset_schema(engine) -> None:
    async with engine.begin() as conn:
        await conn.run_sync(db.Base.metadata.drop_all)
        await conn.run_sync(db.Base.metadata.create_all)


@pytest.fixture(autouse=True, scope="module")
def ensure_schema():
    """Reset the schema once per module to avoid cross-module data leaks."""

    engine = db.engine or db.get_engine()
    asyncio.run(_reset_schema(engine))
    yield
