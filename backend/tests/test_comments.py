import asyncio
import os
import sys
import uuid

import pytest
import jwt

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

os.environ["ADMIN_SECRET"] = "admintest"

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from fastapi.responses import JSONResponse
from app import db
from app.routers import players, auth
from app.routers.auth import get_jwt_secret, JWT_ALG
from app.models import Player, User, Comment, Club, RefreshToken
from app.exceptions import DomainException, ProblemDetail

app = FastAPI()


@app.exception_handler(DomainException)
async def domain_exception_handler(request, exc):
    problem = ProblemDetail(
        type=exc.type,
        title=exc.title,
        detail=exc.detail,
        status=exc.status_code,
        code=exc.code,
    )
    return JSONResponse(
        status_code=exc.status_code,
        content=problem.model_dump(),
        media_type="application/problem+json",
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
    problem = ProblemDetail(
        title=detail,
        detail=detail,
        status=exc.status_code,
        code=getattr(exc, "code", f"http_{exc.status_code}"),
    )
    return JSONResponse(
        status_code=exc.status_code,
        content=problem.model_dump(),
        media_type="application/problem+json",
    )


app.include_router(auth.router)
app.include_router(players.router)

TEST_PASSWORD = "Str0ng!Pass!"


def auth_headers(token: str, *, csrf: bool = False) -> dict[str, str]:
    headers = {"Authorization": f"Bearer {token}"}
    if csrf:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALG])
        csrf_token = payload.get("csrf")
        assert isinstance(csrf_token, str)
        headers["X-CSRF-Token"] = csrf_token
    return headers


def signup_user(client: TestClient, *, is_admin: bool = False) -> tuple[str, str]:
    username_prefix = "admin" if is_admin else "user"
    username = f"{username_prefix}_{uuid.uuid4().hex[:8]}"
    payload = {"username": username, "password": TEST_PASSWORD}
    headers = {}
    if is_admin:
        payload["is_admin"] = True
        headers["X-Admin-Secret"] = os.environ["ADMIN_SECRET"]
    resp = client.post("/auth/signup", json=payload, headers=headers)
    assert resp.status_code == 200
    return resp.json()["access_token"], username


def create_player(client: TestClient, admin_token: str) -> str:
    name = f"Player{uuid.uuid4().hex[:8]}"
    resp = client.post(
        "/players",
        json={"name": name},
        headers=auth_headers(admin_token),
    )
    assert resp.status_code == 200
    return resp.json()["id"]


def post_comment(client: TestClient, player_id: str, token: str, content: str) -> dict:
    resp = client.post(
        f"/players/{player_id}/comments",
        json={"content": content},
        headers=auth_headers(token, csrf=True),
    )
    assert resp.status_code == 200
    return resp.json()


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    async def init_models():
        if os.path.exists("./test_comments.db"):
            os.remove("./test_comments.db")
        db.engine = None
        db.AsyncSessionLocal = None
        engine = db.get_engine()
        async with engine.begin() as conn:
            await conn.run_sync(
                db.Base.metadata.create_all,
                tables=[
                    Club.__table__,
                    Player.__table__,
                    User.__table__,
                    Comment.__table__,
                    RefreshToken.__table__,
                ],
            )
    asyncio.run(init_models())
    yield
    if os.path.exists("./test_comments.db"):
        os.remove("./test_comments.db")


def test_comment_crud():
    auth.limiter.reset()
    with TestClient(app) as client:
        token, username = signup_user(client)
        admin_token, _ = signup_user(client, is_admin=True)
        pid = create_player(client, admin_token)
        comment = post_comment(
            client,
            pid,
            token,
            "Great!",
        )
        cid = comment["id"]
        resp = client.get(f"/players/{pid}/comments")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["limit"] == 50
        assert data["offset"] == 0
        assert len(data["items"]) == 1
        assert data["items"][0]["content"] == "Great!"
        assert data["items"][0]["username"] == username
        resp = client.delete(
            f"/players/{pid}/comments/{cid}",
            headers=auth_headers(token, csrf=True),
        )
        assert resp.status_code == 204
        missing = client.delete(
            f"/players/{pid}/comments/{cid}",
            headers=auth_headers(token, csrf=True),
        )
        assert missing.status_code == 404
        assert missing.json()["code"] == "player_comment_not_found"
        resp = client.get(f"/players/{pid}/comments")
        assert resp.status_code == 200
        data = resp.json()
        assert data["items"] == []
        assert data["total"] == 0
        assert data["limit"] == 50
        assert data["offset"] == 0


def test_comment_list_custom_pagination():
    auth.limiter.reset()
    with TestClient(app) as client:
        token, username = signup_user(client)
        admin_token, _ = signup_user(client, is_admin=True)
        pid = create_player(client, admin_token)
        for idx in range(3):
            post_comment(client, pid, token, f"Comment {idx}")
        resp = client.get(
            f"/players/{pid}/comments",
            params={"limit": 2, "offset": 1},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 3
        assert data["limit"] == 2
        assert data["offset"] == 1
        assert [item["content"] for item in data["items"]] == [
            "Comment 1",
            "Comment 2",
        ]
        assert all(item["username"] == username for item in data["items"])


def test_comment_list_validation():
    auth.limiter.reset()
    with TestClient(app) as client:
        admin_token, _ = signup_user(client, is_admin=True)
        pid = create_player(client, admin_token)
        url = f"/players/{pid}/comments"
        assert client.get(url, params={"limit": 0}).status_code == 422
        assert client.get(url, params={"limit": 101}).status_code == 422
        assert client.get(url, params={"offset": -1}).status_code == 422
