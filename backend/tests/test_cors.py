import os, sys, importlib, pytest

# Ensure the app package is importable
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


def test_rejects_wildcard_with_credentials(monkeypatch):
    monkeypatch.delenv("JWT_SECRET", raising=False)
    monkeypatch.setenv("ALLOWED_ORIGINS", "*")
    monkeypatch.setenv("ALLOW_CREDENTIALS", "true")
    sys.modules.pop("app.main", None)
    with pytest.raises(ValueError):
        importlib.import_module("app.main")

