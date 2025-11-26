import asyncio
import os
import uuid

import jwt
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

from app import db
from app.exceptions import DomainException, ProblemDetail
from app.models import (
    User,
    RefreshToken,
    Sport,
    Match,
    MatchComment,
    ChatMessage,
    Player,
)
from app.routers import auth, matches
from app.routers.auth import JWT_ALG, get_jwt_secret

os.environ.setdefault("ADMIN_SECRET", "admintest")

app = FastAPI()

# Preserve the schema across tests in this module; the fixture below handles
# its own drop/create cycle and seeds data that the tests rely on (e.g. match m1).
pytestmark = pytest.mark.preserve_schema


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
app.include_router(matches.router)

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
        headers["X-Admin-Secret"] = os.environ.get("ADMIN_SECRET", "admintest")
    resp = client.post("/auth/signup", json=payload, headers=headers)
    assert resp.status_code == 200
    return resp.json()["access_token"], username


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    async def init_models():
        db.engine = None
        db.AsyncSessionLocal = None
        engine = db.get_engine()
        async with engine.begin() as conn:
            await conn.run_sync(db.Base.metadata.drop_all)
            await conn.exec_driver_sql("DROP TABLE IF EXISTS match_participant")
            await conn.run_sync(
                db.Base.metadata.create_all,
                tables=[
                    User.__table__,
                    RefreshToken.__table__,
                    Player.__table__,
                    Sport.__table__,
                    Match.__table__,
                    MatchComment.__table__,
                    ChatMessage.__table__,
                ],
            )
            # seed sport and match
            await conn.execute(Sport.__table__.insert().values(id="tennis", name="Tennis"))
            await conn.execute(
                Match.__table__.insert().values(
                    id="m1",
                    sport_id="tennis",
                )
            )
    asyncio.run(init_models())
    yield


@pytest.mark.parametrize("endpoint", [
    "/matches/m1/comments",
    "/matches/m1/chat",
])
def test_requires_auth_for_post(endpoint):
    auth.limiter.reset()
    with TestClient(app) as client:
        resp = client.post(endpoint, json={"content": "hi"})
        assert resp.status_code in (401, 403)


def test_match_comment_crud():
    auth.limiter.reset()
    with TestClient(app) as client:
        token, username = signup_user(client)
        admin_token, _ = signup_user(client, is_admin=True)

        # create comment
        resp = client.post(
            "/matches/m1/comments",
            json={"content": "First!"},
            headers=auth_headers(token, csrf=True),
        )
        assert resp.status_code == 200
        comment_id = resp.json()["id"]

        # list comments
        listing = client.get("/matches/m1/comments")
        assert listing.status_code == 200
        body = listing.json()
        assert body["total"] == 1
        assert body["items"][0]["content"] == "First!"
        assert body["items"][0]["username"] == username

        # unauthorized delete blocked
        other_token, _ = signup_user(client)
        forbidden = client.delete(
            f"/matches/m1/comments/{comment_id}",
            headers=auth_headers(other_token, csrf=True),
        )
        assert forbidden.status_code == 403

        # author can delete
        resp = client.delete(
            f"/matches/m1/comments/{comment_id}",
            headers=auth_headers(token, csrf=True),
        )
        assert resp.status_code == 204

        # admin can delete
        resp = client.post(
            "/matches/m1/comments",
            json={"content": "Admin comment"},
            headers=auth_headers(token, csrf=True),
        )
        cid = resp.json()["id"]
        resp = client.delete(
            f"/matches/m1/comments/{cid}",
            headers=auth_headers(admin_token, csrf=True),
        )
        assert resp.status_code == 204


def test_chat_message_flow():
    auth.limiter.reset()
    with TestClient(app) as client:
        token, username = signup_user(client)

        # create message
        resp = client.post(
            "/matches/m1/chat",
            json={"content": "Hello world", "channel": "live"},
            headers=auth_headers(token, csrf=True),
        )
        assert resp.status_code == 200
        payload = resp.json()
        assert payload["channel"] == "live"

        # list messages
        listing = client.get("/matches/m1/chat")
        assert listing.status_code == 200
        data = listing.json()
        assert data["total"] >= 1
        assert data["items"][0]["username"] == username

        # delete
        message_id = payload["id"]
        resp = client.delete(
            f"/matches/m1/chat/{message_id}",
            headers=auth_headers(token, csrf=True),
        )
        assert resp.status_code == 204
