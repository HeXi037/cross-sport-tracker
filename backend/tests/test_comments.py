import os, sys, asyncio, pytest

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./test_comments.db"
os.environ["JWT_SECRET"] = "x" * 32
os.environ["ADMIN_SECRET"] = "admintest"

from fastapi import FastAPI
from fastapi.testclient import TestClient
from fastapi.responses import JSONResponse
from app import db
from app.routers import players, auth
from app.models import Player, User, Comment, Club
from app.exceptions import DomainException, ProblemDetail

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
                tables=[Club.__table__, Player.__table__, User.__table__, Comment.__table__],
            )
    asyncio.run(init_models())
    yield
    if os.path.exists("./test_comments.db"):
        os.remove("./test_comments.db")


def test_comment_crud():
    with TestClient(app) as client:
        resp = client.post(
            "/auth/signup", json={"username": "bob", "password": "Str0ng!Pass"}
        )
        assert resp.status_code == 200
        token = resp.json()["access_token"]
        admin_token = client.post(
            "/auth/signup",
            json={"username": "admin", "password": "Str0ng!Pass", "is_admin": True},
            headers={"X-Admin-Secret": "admintest"},
        ).json()["access_token"]
        pid = client.post(
            "/players", json={"name": "Player1"},
            headers={"Authorization": f"Bearer {admin_token}"},
        ).json()["id"]
        resp = client.post(
            f"/players/{pid}/comments",
            json={"content": "Great!"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        cid = resp.json()["id"]
        resp = client.get(f"/players/{pid}/comments")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["content"] == "Great!"
        assert data[0]["username"] == "bob"
        resp = client.delete(
            f"/players/{pid}/comments/{cid}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 204
        resp = client.get(f"/players/{pid}/comments")
        assert resp.status_code == 200
        assert resp.json() == []
