import importlib
import os
import sys

import pytest


def _cleanup_app_modules():
    for module in [name for name in sys.modules if name == "app" or name.startswith("app.")]:
        sys.modules.pop(module, None)


@pytest.fixture(autouse=True)
def app_import_isolation(monkeypatch):
    app_path = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    cleanup = _cleanup_app_modules
    cleanup()
    monkeypatch.syspath_prepend(app_path)
    try:
        yield
    finally:
        cleanup()


def test_rejects_wildcard_with_credentials(monkeypatch):
    monkeypatch.delenv("JWT_SECRET", raising=False)
    monkeypatch.setenv("ALLOWED_ORIGINS", "*")
    monkeypatch.setenv("ALLOW_CREDENTIALS", "true")
    with pytest.raises(ValueError):
        importlib.import_module("app.main")


def test_requires_allowed_origins(monkeypatch):
    monkeypatch.delenv("JWT_SECRET", raising=False)
    monkeypatch.delenv("ALLOWED_ORIGINS", raising=False)
    monkeypatch.delenv("ALLOW_CREDENTIALS", raising=False)
    with pytest.raises(ValueError):
        importlib.import_module("app.main")

