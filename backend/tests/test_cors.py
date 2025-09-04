import os
import sys
import importlib
import pytest
from fastapi.testclient import TestClient

# Ensure the app package is importable
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


def test_rejects_wildcard_with_credentials(monkeypatch):
    monkeypatch.delenv("JWT_SECRET", raising=False)
    monkeypatch.setenv("ALLOWED_ORIGINS", "*")
    monkeypatch.setenv("ALLOW_CREDENTIALS", "true")
    sys.modules.pop("app.main", None)
    with pytest.raises(ValueError):
        importlib.import_module("app.main")


def test_exposes_pagination_headers(monkeypatch):
    monkeypatch.setenv("ALLOWED_ORIGINS", "*")
    monkeypatch.setenv("ALLOW_CREDENTIALS", "false")
    sys.modules.pop("app.main", None)
    app = importlib.import_module("app.main").app
    with TestClient(app) as client:
        resp = client.get("/api/healthz", headers={"Origin": "http://example.com"})
        exposed = resp.headers.get("access-control-expose-headers")
        assert exposed is not None
        assert {h.strip() for h in exposed.split(',')} >= {
            "X-Total-Count",
            "X-Limit",
            "X-Offset",
        }

