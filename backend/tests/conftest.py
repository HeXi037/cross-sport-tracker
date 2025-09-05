import os
import pytest

@pytest.fixture(scope="session", autouse=True)
def force_jwt_secret():
    os.environ["JWT_SECRET"] = "x" * 32

