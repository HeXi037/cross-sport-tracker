import os, sys, asyncio, base64, pytest

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

os.environ["ADMIN_SECRET"] = "admintest"

from fastapi import FastAPI
from fastapi.testclient import TestClient
from fastapi.responses import JSONResponse
from httpx import ASGITransport, AsyncClient
from app import db
from app.routers import players, auth, badges
from app.models import (
    Player,
    Club,
    User,
    Badge,
    PlayerBadge,
    PlayerMetric,
    RefreshToken,
    PlayerSocialLink,
)
from app.exceptions import DomainException, ProblemDetail

VALID_PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC"
)

app = FastAPI()

@app.exception_handler(DomainException)
async def domain_exception_handler(request, exc):
    problem = ProblemDetail(
        type=exc.type,
        title=exc.title,
        detail=exc.detail,
        status=exc.status_code,
    )
    return JSONResponse(
        status_code=exc.status_code,
        content=problem.model_dump(),
        media_type="application/problem+json",
    )

app.include_router(auth.router)
app.include_router(players.router)
app.include_router(badges.router)


@pytest.fixture
def async_client():
    loop = asyncio.new_event_loop()
    transport = ASGITransport(app=app)
    client = AsyncClient(transport=transport, base_url="http://testserver")
    loop.run_until_complete(client.__aenter__())
    try:
        yield client, loop
    finally:
        loop.run_until_complete(client.__aexit__(None, None, None))
        loop.close()


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    async def init_models():
        if os.path.exists("./test_players.db"):
            os.remove("./test_players.db")
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
                    Badge.__table__,
                    PlayerBadge.__table__,
                    PlayerMetric.__table__,
                    RefreshToken.__table__,
                    PlayerSocialLink.__table__,
                ],
            )
    asyncio.run(init_models())
    yield
    if os.path.exists("./test_players.db"):
        os.remove("./test_players.db")


def admin_token(client: TestClient) -> str:
    auth.limiter.reset()
    resp = client.post(
        "/auth/signup",
        json={"username": "admin", "password": "Str0ng!Pass!", "is_admin": True},
        headers={"X-Admin-Secret": "admintest"},
    )
    if resp.status_code != 200:
        resp = client.post(
            "/auth/login", json={"username": "admin", "password": "Str0ng!Pass!"}
        )
    return resp.json()["access_token"]


async def async_admin_token(client: AsyncClient) -> str:
    auth.limiter.reset()
    resp = await client.post(
        "/auth/signup",
        json={"username": "admin", "password": "Str0ng!Pass!", "is_admin": True},
        headers={"X-Admin-Secret": "admintest"},
    )
    if resp.status_code != 200:
        resp = await client.post(
            "/auth/login", json={"username": "admin", "password": "Str0ng!Pass!"}
        )
    return resp.json()["access_token"]

def test_list_players_pagination() -> None:
    with TestClient(app) as client:
        token = admin_token(client)
        default_resp = client.get("/players")
        assert default_resp.status_code == 200
        default_data = default_resp.json()
        base_total = default_data.get("total", 0)
        assert default_data["limit"] == 50
        assert default_data["offset"] == 0
        for i in range(5):
            resp = client.post(
                "/players",
                json={"name": f"P{i}"},
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp.status_code == 200
        resp = client.get("/players", params={"limit": 2, "offset": 1})
        assert resp.status_code == 200
        data = resp.json()
        assert data["limit"] == 2
        assert data["offset"] == 1
        assert data["total"] == base_total + 5
        assert len(data["players"]) == 2

def test_delete_player_requires_token() -> None:
    with TestClient(app) as client:
        token = admin_token(client)
        pid = client.post(
            "/players", json={"name": "Alice"}, headers={"Authorization": f"Bearer {token}"}
        ).json()["id"]
        resp = client.delete(f"/players/{pid}")
        assert resp.status_code == 401

def test_delete_player_soft_delete() -> None:
    with TestClient(app, raise_server_exceptions=False) as client:
        token = admin_token(client)
        pid = client.post(
            "/players", json={"name": "Bob"}, headers={"Authorization": f"Bearer {token}"}
        ).json()["id"]
        resp = client.delete(
            f"/players/{pid}", headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 204
        assert client.get(f"/players/{pid}").status_code == 404

    async def check_deleted():
        async with db.AsyncSessionLocal() as session:
            p = await session.get(Player, pid)
            assert p is not None and p.deleted_at is not None

    asyncio.run(check_deleted())


def test_hard_delete_player_allows_username_reuse() -> None:
    with TestClient(app) as client:
        token = admin_token(client)

        # initial signup creates both user and player
        resp = client.post(
            "/auth/signup", json={"username": "Eve", "password": "Str0ng!Pass!"}
        )
        assert resp.status_code == 200

        # lookup player id for Eve
        pid = client.get("/players", params={"q": "eve"}).json()["players"][0]["id"]

        # hard delete the player (and associated user)
        resp = client.delete(
            f"/players/{pid}",
            params={"hard": "true"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 204

        # signup again with the same username should now succeed
        resp = client.post(
            "/auth/signup", json={"username": "Eve", "password": "Str0ng!Pass!"}
        )
        assert resp.status_code == 200

def test_create_player_invalid_name() -> None:
    with TestClient(app) as client:
        token = admin_token(client)
        resp = client.post(
            "/players",
            json={"name": "Bad!"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 422

def test_player_badges() -> None:
    with TestClient(app) as client:
        token = admin_token(client)
        pid = client.post(
            "/players", json={"name": "Dana"}, headers={"Authorization": f"Bearer {token}"}
        ).json()["id"]
        bid = client.post(
            "/badges",
            json={"name": "MVP"},
            headers={"Authorization": f"Bearer {token}"},
        ).json()["id"]
        resp = client.post(
            f"/players/{pid}/badges/{bid}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 204
        data = client.get(f"/players/{pid}").json()
        assert data["badges"] == [{"id": bid, "name": "MVP", "icon": None}]
        assert data["social_links"] == []


def test_remove_player_badge() -> None:
    with TestClient(app) as client:
        token = admin_token(client)
        pid = client.post(
            "/players", json={"name": "Eddie"}, headers={"Authorization": f"Bearer {token}"}
        ).json()["id"]
        bid = client.post(
            "/badges",
            json={"name": "Champion"},
            headers={"Authorization": f"Bearer {token}"},
        ).json()["id"]
        add_resp = client.post(
            f"/players/{pid}/badges/{bid}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert add_resp.status_code == 204

        resp = client.delete(
            f"/players/{pid}/badges/{bid}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 204
        data = client.get(f"/players/{pid}").json()
        assert data["badges"] == []
        assert data["social_links"] == []


def test_add_duplicate_player_badge_returns_conflict() -> None:
    with TestClient(app) as client:
        token = admin_token(client)
        pid = client.post(
            "/players", json={"name": "Gabe"}, headers={"Authorization": f"Bearer {token}"}
        ).json()["id"]
        bid = client.post(
            "/badges",
            json={"name": "Legend"},
            headers={"Authorization": f"Bearer {token}"},
        ).json()["id"]

        add_resp = client.post(
            f"/players/{pid}/badges/{bid}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert add_resp.status_code == 204

        duplicate_resp = client.post(
            f"/players/{pid}/badges/{bid}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert duplicate_resp.status_code == 409
        assert duplicate_resp.json() == {"detail": "player already has this badge"}

        resp = client.delete(
            f"/players/{pid}/badges/{bid}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 204

        data = client.get(f"/players/{pid}").json()
        assert data["badges"] == []
        assert data["social_links"] == []


def test_remove_player_badge_missing() -> None:
    with TestClient(app) as client:
        token = admin_token(client)
        pid = client.post(
            "/players", json={"name": "Frank"}, headers={"Authorization": f"Bearer {token}"}
        ).json()["id"]
        resp = client.delete(
            f"/players/{pid}/badges/missing",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 404
        body = resp.json()
        assert body["detail"] == "player badge not found"


def test_players_by_ids_omits_deleted() -> None:
    with TestClient(app) as client:
        token = admin_token(client)
        active_id = client.post(
            "/players", json={"name": "Active"}, headers={"Authorization": f"Bearer {token}"}
        ).json()["id"]
        deleted_id = client.post(
            "/players", json={"name": "Gone"}, headers={"Authorization": f"Bearer {token}"}
        ).json()["id"]
        client.delete(
            f"/players/{deleted_id}", headers={"Authorization": f"Bearer {token}"}
        )
        resp = client.get(
            "/players/by-ids", params={"ids": f"{active_id},{deleted_id}"}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data == [{"id": active_id, "name": "active", "photo_url": None}]

def test_upload_player_photo_prefixed_url() -> None:
    with TestClient(app) as client:
        token = admin_token(client)
        pid = client.post(
            "/players", json={"name": "Pic"}, headers={"Authorization": f"Bearer {token}"}
        ).json()["id"]
        files = {"file": ("avatar.png", VALID_PNG_BYTES, "image/png")}
        resp = client.post(
            f"/players/{pid}/photo",
            files=files,
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["photo_url"].startswith("/api/static/players/")
        filename = data["photo_url"].split("/")[-1]
        filepath = players.UPLOAD_DIR / filename
        if filepath.exists():
            filepath.unlink()


def test_upload_player_photo_streams_chunks(async_client, monkeypatch) -> None:
    client, loop = async_client
    monkeypatch.setattr(players, "CHUNK_SIZE", 8)
    token = loop.run_until_complete(async_admin_token(client))
    resp = loop.run_until_complete(
        client.post(
            "/players",
            json={"name": "AsyncPic"},
            headers={"Authorization": f"Bearer {token}"},
        )
    )
    assert resp.status_code == 200
    pid = resp.json()["id"]
    files = {"file": ("avatar.png", VALID_PNG_BYTES, "image/png")}
    resp = loop.run_until_complete(
        client.post(
            f"/players/{pid}/photo",
            files=files,
            headers={"Authorization": f"Bearer {token}"},
        )
    )
    assert resp.status_code == 200
    filename = resp.json()["photo_url"].split("/")[-1]
    filepath = players.UPLOAD_DIR / filename
    try:
        assert filepath.exists()
        assert filepath.read_bytes() == VALID_PNG_BYTES
    finally:
        if filepath.exists():
            filepath.unlink()


def test_upload_player_photo_too_large() -> None:
    with TestClient(app) as client:
        token = admin_token(client)
        pid = client.post(
            "/players", json={"name": "BigPic"}, headers={"Authorization": f"Bearer {token}"}
        ).json()["id"]
        big_file = b"x" * (players.MAX_PHOTO_SIZE + 1)
        files = {"file": ("big.png", big_file, "image/png")}
        resp = client.post(
            f"/players/{pid}/photo",
            files=files,
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 413


def test_upload_player_photo_invalid_mime_type() -> None:
    with TestClient(app) as client:
        token = admin_token(client)
        pid = client.post(
            "/players", json={"name": "BadPic"}, headers={"Authorization": f"Bearer {token}"}
        ).json()["id"]
        files = {"file": ("avatar.gif", b"gif", "image/gif")}
        resp = client.post(
            f"/players/{pid}/photo", files=files, headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 415


@pytest.mark.parametrize(
    ("filename", "mime_type"),
    [("avatar.jpg", "image/jpeg"), ("avatar.png", "image/png")],
)
def test_upload_player_photo_rejects_invalid_bytes(filename: str, mime_type: str) -> None:
    with TestClient(app) as client:
        token = admin_token(client)
        player_name = f"FakePic-{mime_type.split('/')[-1]}"
        pid = client.post(
            "/players", json={"name": player_name}, headers={"Authorization": f"Bearer {token}"}
        ).json()["id"]
        files = {"file": (filename, b"not an image", mime_type)}
        resp = client.post(
            f"/players/{pid}/photo", files=files, headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 415


def test_players_me_endpoints_require_authentication() -> None:
    with TestClient(app) as client:
        resp = client.get("/players/me")
        assert resp.status_code == 401

        resp = client.patch("/players/me/location", json={})
        assert resp.status_code == 401


def test_get_players_me_returns_current_player() -> None:
    with TestClient(app) as client:
        auth.limiter.reset()
        signup = client.post(
            "/auth/signup",
            json={"username": "selfie", "password": "Str0ng!Pass!"},
        )
        assert signup.status_code == 200
        token = signup.json()["access_token"]

        resp = client.get(
            "/players/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "selfie"
        assert data["id"]
        assert data["social_links"] == []


def test_update_players_me_location_success() -> None:
    with TestClient(app) as client:
        auth.limiter.reset()
        signup = client.post(
            "/auth/signup",
            json={"username": "loc-success", "password": "Str0ng!Pass!"},
        )
        assert signup.status_code == 200
        token = signup.json()["access_token"]

        resp = client.put(
            "/players/me/location",
            json={"country_code": "us"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["location"] == "US"
        assert data["country_code"] == "US"
        assert data["region_code"] == "NA"
        assert data["social_links"] == []

        me = client.get(
            "/players/me", headers={"Authorization": f"Bearer {token}"}
        )
        assert me.status_code == 200
        assert me.json()["location"] == "US"


@pytest.mark.parametrize(
    ("payload", "username"),
    [
        ({"country_code": "USA"}, "loc-validate-0"),
        ({"region_code": "CA"}, "loc-validate-1"),
    ],
)
def test_update_players_me_location_validation_errors(payload, username) -> None:
    with TestClient(app) as client:
        auth.limiter.reset()
        signup = client.post(
            "/auth/signup",
            json={"username": username, "password": "Str0ng!Pass!"},
        )
        assert signup.status_code == 200
        token = signup.json()["access_token"]

        resp = client.patch(
            "/players/me/location",
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 422


def test_update_players_me_location_allows_clearing_values() -> None:
    with TestClient(app) as client:
        auth.limiter.reset()
        signup = client.post(
            "/auth/signup",
            json={"username": "loc-clear", "password": "Str0ng!Pass!"},
        )
        assert signup.status_code == 200
        token = signup.json()["access_token"]

        resp = client.put(
            "/players/me/location",
            json={"country_code": "us"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["location"] == "US"
        assert data["region_code"] == "NA"
        assert data["social_links"] == []

        cleared = client.patch(
            "/players/me/location",
            json={
                "location": "",
                "country_code": "",
                "region_code": "",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert cleared.status_code == 200
        cleared_data = cleared.json()
        assert cleared_data["location"] is None
        assert cleared_data["country_code"] is None
        assert cleared_data["region_code"] is None
        assert cleared_data["social_links"] == []


def test_update_players_me_location_updates_club() -> None:
    with TestClient(app) as client:
        auth.limiter.reset()
        signup = client.post(
            "/auth/signup",
            json={"username": "loc-club", "password": "Str0ng!Pass!"},
        )
        assert signup.status_code == 200
        token = signup.json()["access_token"]

        async def insert_club():
            async with db.AsyncSessionLocal() as session:
                session.add(Club(id="club-update", name="Club Update"))
                await session.commit()

        asyncio.run(insert_club())

        resp = client.patch(
            "/players/me/location",
            json={"club_id": "club-update"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["club_id"] == "club-update"
        assert data["social_links"] == []

        cleared = client.patch(
            "/players/me/location",
            json={"club_id": ""},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert cleared.status_code == 200
        cleared_body = cleared.json()
        assert cleared_body["club_id"] is None
        assert cleared_body["social_links"] == []


def test_player_social_links_crud() -> None:
    with TestClient(app) as client:
        auth.limiter.reset()
        signup = client.post(
            "/auth/signup",
            json={"username": "social-user", "password": "Str0ng!Pass!"},
        )
        assert signup.status_code == 200
        token = signup.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        list_resp = client.get("/players/me/social-links", headers=headers)
        assert list_resp.status_code == 200
        assert list_resp.json() == []

        create_resp = client.post(
            "/players/me/social-links",
            headers=headers,
            json={"label": "Twitter", "url": "https://twitter.com/example"},
        )
        assert create_resp.status_code == 200
        created = create_resp.json()
        assert created["label"] == "Twitter"
        assert created["url"] == "https://twitter.com/example"
        assert isinstance(created["position"], int)
        link_id = created["id"]

        list_after = client.get("/players/me/social-links", headers=headers)
        assert list_after.status_code == 200
        after_items = list_after.json()
        assert len(after_items) == 1
        assert after_items[0]["id"] == link_id

        update_resp = client.patch(
            f"/players/me/social-links/{link_id}",
            headers=headers,
            json={"label": "Website", "url": "https://example.com"},
        )
        assert update_resp.status_code == 200
        updated = update_resp.json()
        assert updated["label"] == "Website"
        assert updated["url"] == "https://example.com"

        me = client.get("/players/me", headers=headers)
        assert me.status_code == 200
        me_links = me.json()["social_links"]
        assert len(me_links) == 1 and me_links[0]["label"] == "Website"

        delete_resp = client.delete(
            f"/players/me/social-links/{link_id}",
            headers=headers,
        )
        assert delete_resp.status_code == 204

        final_list = client.get("/players/me/social-links", headers=headers)
        assert final_list.status_code == 200
        assert final_list.json() == []

        final_me = client.get("/players/me", headers=headers)
        assert final_me.status_code == 200
        assert final_me.json()["social_links"] == []


def test_admin_update_player_location_success() -> None:
    with TestClient(app) as client:
        token = admin_token(client)
        pid = client.post(
            "/players",
            json={"name": "admin-loc"},
            headers={"Authorization": f"Bearer {token}"},
        ).json()["id"]

        resp = client.patch(
            f"/players/{pid}/location",
            json={"country_code": "us"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["country_code"] == "US"
        assert data["region_code"] == "NA"
        assert data["social_links"] == []

        fetched = client.get(f"/players/{pid}")
        assert fetched.status_code == 200
        fetched_body = fetched.json()
        assert fetched_body["country_code"] == "US"
        assert fetched_body["social_links"] == []


def test_admin_update_player_location_validation_error() -> None:
    with TestClient(app) as client:
        token = admin_token(client)
        pid = client.post(
            "/players",
            json={"name": "admin-loc-invalid"},
            headers={"Authorization": f"Bearer {token}"},
        ).json()["id"]

        resp = client.patch(
            f"/players/{pid}/location",
            json={"country_code": "USA"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 422


def test_admin_update_player_location_requires_admin() -> None:
    with TestClient(app) as client:
        admin = admin_token(client)
        pid = client.post(
            "/players",
            json={"name": "admin-loc-forbidden"},
            headers={"Authorization": f"Bearer {admin}"},
        ).json()["id"]

        auth.limiter.reset()
        signup = client.post(
            "/auth/signup",
            json={"username": "regular-loc", "password": "Str0ng!Pass!"},
        )
        assert signup.status_code == 200
        token = signup.json()["access_token"]

        resp = client.patch(
            f"/players/{pid}/location",
            json={"country_code": "US"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403


def test_players_me_endpoints_return_404_when_player_missing() -> None:
    with TestClient(app) as client:
        auth.limiter.reset()
        signup = client.post(
            "/auth/signup",
            json={"username": "ghosted", "password": "Str0ng!Pass!"},
        )
        assert signup.status_code == 200
        token = signup.json()["access_token"]

        listing = client.get("/players", params={"q": "ghosted"})
        assert listing.status_code == 200
        player_id = listing.json()["players"][0]["id"]

        admin = admin_token(client)
        delete_resp = client.delete(
            f"/players/{player_id}",
            headers={"Authorization": f"Bearer {admin}"},
        )
        assert delete_resp.status_code == 204

        resp = client.get(
            "/players/me", headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 404

        resp = client.patch(
            "/players/me/location",
            json={"country_code": "US"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 404
