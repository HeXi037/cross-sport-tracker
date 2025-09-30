import asyncio
import os
import uuid

import jwt

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import db
from app.models import Sport
from app.routers import auth, matches, notifications, players
from app.routers.auth import get_jwt_secret, JWT_ALG


os.environ.setdefault("ADMIN_SECRET", "admintest")


TEST_PASSWORD = "Str0ng!Pass!"


def _auth_headers(token: str, *, csrf: bool = False) -> dict[str, str]:
    headers = {"Authorization": f"Bearer {token}"}
    if csrf:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALG])
        csrf_token = payload.get("csrf")
        assert isinstance(csrf_token, str)
        headers["X-CSRF-Token"] = csrf_token
    return headers


def _signup_user(client: TestClient, *, is_admin: bool = False) -> tuple[str, str]:
    username = f"user_{uuid.uuid4().hex[:8]}"
    payload: dict[str, object] = {"username": username, "password": TEST_PASSWORD}
    headers: dict[str, str] = {}
    if is_admin:
        payload["is_admin"] = True
        headers["X-Admin-Secret"] = os.environ["ADMIN_SECRET"]
    resp = client.post("/auth/signup", json=payload, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    return data["access_token"], username


def _create_player_for_user(client: TestClient, token: str) -> dict:
    resp = client.post("/players/me", headers=_auth_headers(token))
    if resp.status_code in (200, 201):
        return resp.json()
    if resp.status_code == 400:
        existing = client.get("/players/me", headers=_auth_headers(token))
        assert existing.status_code == 200
        return existing.json()
    assert False, f"unexpected status {resp.status_code}: {resp.text}"


@pytest.fixture(scope="module", autouse=True)
def seed_sports():
    async def _insert() -> None:
        async with db.AsyncSessionLocal() as session:
            session.add(Sport(id="padel", name="Padel"))
            await session.commit()

    asyncio.run(_insert())


def test_comment_and_match_notifications_flow():
    app = FastAPI()
    app.include_router(auth.router)
    app.include_router(players.router)
    app.include_router(matches.router)
    app.include_router(notifications.router)

    with TestClient(app) as client:
        auth.limiter.reset()
        owner_token, _ = _signup_user(client)
        opponent_token, _ = _signup_user(client)
        admin_token, _ = _signup_user(client, is_admin=True)

        owner_player = _create_player_for_user(client, owner_token)
        opponent_player = _create_player_for_user(client, opponent_token)

        # Preferences default to opt-out
        pref_resp = client.get(
            "/notifications/preferences",
            headers=_auth_headers(owner_token),
        )
        assert pref_resp.status_code == 200
        pref_data = pref_resp.json()
        assert pref_data["notifyOnProfileComments"] is False
        assert pref_data["notifyOnMatchResults"] is False

        # Enable comment notifications for owner
        update_resp = client.put(
            "/notifications/preferences",
            json={"notifyOnProfileComments": True},
            headers=_auth_headers(owner_token),
        )
        assert update_resp.status_code == 200
        assert update_resp.json()["notifyOnProfileComments"] is True

        # Comment from another user triggers a notification
        comment_resp = client.post(
            f"/players/{owner_player['id']}/comments",
            json={"content": "Nice game!"},
            headers=_auth_headers(opponent_token, csrf=True),
        )
        assert comment_resp.status_code == 200

        notif_resp = client.get(
            "/notifications",
            headers=_auth_headers(owner_token),
        )
        assert notif_resp.status_code == 200
        notif_data = notif_resp.json()
        types = [item["type"] for item in notif_data["items"]]
        assert "profile_comment" in types

        # Enable match notifications for both players
        client.put(
            "/notifications/preferences",
            json={"notifyOnMatchResults": True},
            headers=_auth_headers(owner_token),
        )
        client.put(
            "/notifications/preferences",
            json={"notifyOnMatchResults": True},
            headers=_auth_headers(opponent_token),
        )

        match_payload = {
            "sport": "padel",
            "participants": [
                {"side": "A", "playerIds": [owner_player["id"]]},
                {"side": "B", "playerIds": [opponent_player["id"]]},
            ],
            "bestOf": 3,
            "sets": [[6, 4], [6, 3]],
            "isFriendly": False,
        }
        match_resp = client.post(
            "/matches",
            json=match_payload,
            headers=_auth_headers(admin_token),
        )
        assert match_resp.status_code == 200

        owner_notifs = client.get(
            "/notifications",
            headers=_auth_headers(owner_token),
        ).json()
        assert "match_recorded" in [item["type"] for item in owner_notifs["items"]]

        opponent_notifs = client.get(
            "/notifications",
            headers=_auth_headers(opponent_token),
        ).json()
        match_ids = [item for item in opponent_notifs["items"] if item["type"] == "match_recorded"]
        assert match_ids, "Opponent should receive match notification"

        mark_resp = client.post(
            f"/notifications/{match_ids[0]['id']}/read",
            headers=_auth_headers(opponent_token),
        )
        assert mark_resp.status_code == 204
