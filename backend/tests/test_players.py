import os, sys, asyncio, pytest

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./test_players.db"
# Use a sufficiently long secret for JWTs in tests
os.environ["JWT_SECRET"] = "x" * 32
os.environ["ADMIN_SECRET"] = "admintest"

from fastapi import FastAPI
from fastapi.testclient import TestClient
from fastapi.responses import JSONResponse
from app import db
from app.routers import players, auth, badges
from app.models import Player, Club, User, Badge, PlayerBadge, PlayerMetric
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
app.include_router(badges.router)

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
        json={"username": "admin", "password": "Str0ng!Pass", "is_admin": True},
        headers={"X-Admin-Secret": "admintest"},
    )
    if resp.status_code != 200:
        resp = client.post(
            "/auth/login", json={"username": "admin", "password": "Str0ng!Pass"}
        )
    return resp.json()["access_token"]

def test_list_players_pagination() -> None:
    with TestClient(app) as client:
        token = admin_token(client
