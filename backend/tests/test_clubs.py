import asyncio
import os
import sys
from typing import Iterator, Tuple

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from httpx import ASGITransport, AsyncClient

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import db
from app.exceptions import DomainException, ProblemDetail
from app.models import Club, Player, Rating, RefreshToken, Sport, User
from app.routers import auth, clubs

os.environ["ADMIN_SECRET"] = "admintest"


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
app.include_router(clubs.router)


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    async def init_models():
        if os.path.exists("./test_clubs.db"):
            os.remove("./test_clubs.db")
        db.engine = None
        db.AsyncSessionLocal = None
        engine = db.get_engine()
        async with engine.begin() as conn:
            await conn.run_sync(
                db.Base.metadata.create_all,
                tables=[
                    User.__table__,
                    RefreshToken.__table__,
                    Sport.__table__,
                    Player.__table__,
                    Club.__table__,
                    Rating.__table__,
                ],
            )

    asyncio.run(init_models())
    yield
    if os.path.exists("./test_clubs.db"):
        os.remove("./test_clubs.db")


@pytest.fixture
def async_client() -> Iterator[Tuple[AsyncClient, asyncio.AbstractEventLoop]]:
    loop = asyncio.new_event_loop()
    transport = ASGITransport(app=app)
    client = AsyncClient(transport=transport, base_url="http://testserver")
    loop.run_until_complete(client.__aenter__())
    try:
        yield client, loop
    finally:
        loop.run_until_complete(client.__aexit__(None, None, None))
        loop.close()


async def create_admin_token(client: AsyncClient) -> str:
    auth.limiter.reset()
    response = await client.post(
        "/auth/signup",
        json={"username": "club-admin", "password": "Str0ng!Pass!", "is_admin": True},
        headers={"X-Admin-Secret": "admintest"},
    )
    if response.status_code != 200:
        response = await client.post(
            "/auth/login", json={"username": "club-admin", "password": "Str0ng!Pass!"}
        )
    data = response.json()
    return data["access_token"]


def test_create_club_requires_admin(async_client) -> None:
    client, loop = async_client

    async def scenario() -> None:
        response = await client.post("/clubs", json={"id": "club-1", "name": "Club One"})
        assert response.status_code == 401

        auth.limiter.reset()
        user_resp = await client.post(
            "/auth/signup",
            json={"username": "regular", "password": "Str0ng!Pass!", "is_admin": False},
            headers={"X-Admin-Secret": "admintest"},
        )
        assert user_resp.status_code == 200
        token = user_resp.json()["access_token"]

        response = await client.post(
            "/clubs",
            json={"id": "club-2", "name": "Club Two"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 403
        payload = response.json()
        assert payload["code"] == "admin_forbidden"

    loop.run_until_complete(scenario())


def test_create_and_list_clubs(async_client) -> None:
    client, loop = async_client

    async def scenario() -> None:
        token = await create_admin_token(client)

        create_resp = await client.post(
            "/clubs",
            json={"id": "club-alpha", "name": "Club Alpha"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert create_resp.status_code == 201
        assert create_resp.json() == {"id": "club-alpha", "name": "Club Alpha"}

        list_resp = await client.get("/clubs")
        assert list_resp.status_code == 200
        assert list_resp.json() == [{"id": "club-alpha", "name": "Club Alpha"}]

    loop.run_until_complete(scenario())


def test_create_club_conflict(async_client) -> None:
    client, loop = async_client

    async def scenario() -> None:
        token = await create_admin_token(client)

        first = await client.post(
            "/clubs",
            json={"id": "club-beta", "name": "Club Beta"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert first.status_code == 201

        duplicate = await client.post(
            "/clubs",
            json={"id": "club-beta", "name": "Club Beta"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert duplicate.status_code == 409
        payload = duplicate.json()
        assert payload["code"] == "club_exists"

    loop.run_until_complete(scenario())


def test_list_clubs_supports_country_and_sport_filters(async_client) -> None:
    client, loop = async_client

    async def scenario() -> None:
        token = await create_admin_token(client)
        for club_id, club_name in (
            ("club-se-padel", "Club SE Padel"),
            ("club-se-bowl", "Club SE Bowl"),
            ("club-us-padel", "Club US Padel"),
        ):
            response = await client.post(
                "/clubs",
                json={"id": club_id, "name": club_name},
                headers={"Authorization": f"Bearer {token}"},
            )
            assert response.status_code in {201, 409}

        async with db.AsyncSessionLocal() as session:
            session.add_all(
                [
                    Sport(id="padel", name="Padel"),
                    Sport(id="bowling", name="Bowling"),
                ]
            )
            session.add_all(
                [
                    Player(
                        id="player-se-padel",
                        name="Player SE Padel",
                        location="SE",
                        club_id="club-se-padel",
                    ),
                    Player(
                        id="player-se-bowl",
                        name="Player SE Bowl",
                        location="SE",
                        club_id="club-se-bowl",
                    ),
                    Player(
                        id="player-us-padel",
                        name="Player US Padel",
                        location="US",
                        club_id="club-us-padel",
                    ),
                ]
            )
            session.add_all(
                [
                    Rating(id="rating-se-padel", player_id="player-se-padel", sport_id="padel", value=1000),
                    Rating(id="rating-se-bowl", player_id="player-se-bowl", sport_id="bowling", value=1000),
                    Rating(id="rating-us-padel", player_id="player-us-padel", sport_id="padel", value=1000),
                ]
            )
            await session.commit()

        country_only = await client.get("/clubs", params={"country": "SE"})
        assert country_only.status_code == 200
        assert [club["id"] for club in country_only.json()] == [
            "club-se-bowl",
            "club-se-padel",
        ]

        sport_and_country = await client.get(
            "/clubs", params={"country": "SE", "sport": "padel"}
        )
        assert sport_and_country.status_code == 200
        assert sport_and_country.json() == [
            {"id": "club-se-padel", "name": "Club SE Padel"}
        ]

        sport_only = await client.get("/clubs", params={"sport": "padel"})
        assert sport_only.status_code == 200
        assert [club["id"] for club in sport_only.json()] == [
            "club-se-padel",
            "club-us-padel",
        ]

    loop.run_until_complete(scenario())
