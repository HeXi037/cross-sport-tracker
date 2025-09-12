import logging
import os
import sys
from fastapi import FastAPI
from fastapi.testclient import TestClient

# Ensure the app package is importable
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Avoid startup validation error when importing the app
os.environ.setdefault("ALLOW_CREDENTIALS", "false")
os.environ.setdefault("ALLOWED_ORIGINS", "")
from app.main import unhandled_exception_handler


def test_unhandled_exception_logs_traceback(caplog):
    app = FastAPI()
    app.add_exception_handler(Exception, unhandled_exception_handler)

    @app.get("/boom")
    def boom():
        raise ValueError("boom")

    client = TestClient(app, raise_server_exceptions=False)
    with caplog.at_level(logging.ERROR):
        response = client.get("/boom")

    assert response.status_code == 500
    record = next((r for r in caplog.records if r.message == "Unhandled exception"), None)
    assert record is not None
    assert record.exc_info[0] is ValueError
    assert "ValueError: boom" in caplog.text

