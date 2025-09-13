import os
import sys
import pytest

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from app import db

# A sufficiently long JWT secret for tests
TEST_JWT_SECRET = "x" * 32
os.environ.setdefault("JWT_SECRET", TEST_JWT_SECRET)
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")


@pytest.fixture(autouse=True)
def _db(monkeypatch):
    """Provide a clean in-memory database for each test."""
    if not os.getenv("DATABASE_URL"):
        monkeypatch.setenv("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
    db.engine = None
    db.AsyncSessionLocal = None
    yield
    if db.engine is not None:
        db.engine.sync_engine.dispose()
    db.engine = None
    db.AsyncSessionLocal = None


@pytest.fixture(autouse=True)
def jwt_secret(monkeypatch):
    """Ensure a strong JWT secret is present for all tests."""
    monkeypatch.setenv("JWT_SECRET", TEST_JWT_SECRET)
    yield
