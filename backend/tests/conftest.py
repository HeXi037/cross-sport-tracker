import os
import pytest

# A sufficiently long JWT secret for tests
TEST_JWT_SECRET = "x" * 32
os.environ.setdefault("JWT_SECRET", TEST_JWT_SECRET)

@pytest.fixture(autouse=True)
def jwt_secret(monkeypatch):
    """Ensure a strong JWT secret is present for all tests."""
    monkeypatch.setenv("JWT_SECRET", TEST_JWT_SECRET)
    yield
