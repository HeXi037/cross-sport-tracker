import os
import sys
import asyncio

import pytest

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


@pytest.fixture(scope="session")
def session_loop():
    """Single event loop for all sync fixtures that need to run async DB code."""

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    yield loop
    loop.close()

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
def ensure_database(session_loop):
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
    if db.engine is not None:
        session_loop.run_until_complete(db.engine.dispose())
        db.engine = None

    if db.AsyncSessionLocal is not None:
        db.AsyncSessionLocal = None
    mp.undo()


async def _reset_schema(engine) -> None:
    async with engine.begin() as conn:
        # Drop auxiliary tables that aren't attached to the ORM metadata but
        # can be created inside tests (e.g. match_participant) so the next test
        # can recreate them without hitting "table already exists" errors.
        await conn.exec_driver_sql("DROP TABLE IF EXISTS match_participant")
        await conn.run_sync(db.Base.metadata.drop_all)
        await conn.run_sync(db.Base.metadata.create_all)


@pytest.fixture(autouse=True)
def reset_schema(request, session_loop):
    """Reset the schema before each test unless preserved via marker."""

    if request.node.get_closest_marker("preserve_schema"):
        yield
        return

    engine = db.engine or db.get_engine()
    session_loop.run_until_complete(_reset_schema(engine))
    yield


def create_table(sync_conn, table):
    """Create a table if it is missing, without failing when it already exists."""

    table.create(bind=sync_conn, checkfirst=True)

# Expose for test modules that call run_sync(create_table, ...)
import builtins

builtins.create_table = create_table
