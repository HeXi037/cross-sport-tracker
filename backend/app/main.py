from fastapi import APIRouter, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from slowapi.errors import RateLimitExceeded
from .routers import (
    sports,
    rulesets,
    players,
    matches,
    leaderboards,
    streams,
    tournaments,
    auth,
    badges,
    clubs,
)
from .routes import player as player_pages
from .exceptions import DomainException, ProblemDetail
from .config import API_PREFIX
import logging
import os


logger = logging.getLogger(__name__)


ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv("ALLOWED_ORIGINS", "*").split(",")
    if o.strip()
]
ALLOW_CREDENTIALS = os.getenv("ALLOW_CREDENTIALS", "true").lower() == "true"

# CORS safety check
if ALLOW_CREDENTIALS and (not ALLOWED_ORIGINS or "*" in ALLOWED_ORIGINS):
    raise ValueError(
        "ALLOWED_ORIGINS cannot be '*' when credentials are allowed. "
        "Set ALLOWED_ORIGINS to a comma-separated list of origins or set "
        "ALLOW_CREDENTIALS=false."
    )

app = FastAPI(
    title="Cross Sport Tracker API",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

app.state.limiter = auth.limiter
app.add_exception_handler(RateLimitExceeded, auth.rate_limit_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS or ["*"],
    allow_credentials=ALLOW_CREDENTIALS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Fail fast if JWT_SECRET is missing or weak
auth.get_jwt_secret()

static_dir = Path(__file__).resolve().parent / "static"
static_dir.mkdir(parents=True, exist_ok=True)
app.mount(f"{API_PREFIX}/static", StaticFiles(directory=str(static_dir)), name="static")


@app.get("/healthz", tags=["health"])  # Unprefixed for reverse proxy / uptime checks
def root_healthz():
    return {"status": "ok"}


@app.exception_handler(DomainException)
async def domain_exception_handler(request: Request, exc: DomainException) -> JSONResponse:
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
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
    code = getattr(exc, "code", f"http_{exc.status_code}")
    problem = ProblemDetail(
        title=detail,
        detail=detail,
        status=exc.status_code,
        code=code,
    )
    return JSONResponse(
        status_code=exc.status_code,
        content=problem.model_dump(),
        media_type="application/problem+json",
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error("Unhandled exception", exc_info=(type(exc), exc, exc.__traceback__))
    problem = ProblemDetail(
        title="Internal Server Error",
        status=500,
        detail=str(exc),
        code="internal_server_error",
    )
    return JSONResponse(
        status_code=500,
        content=problem.model_dump(),
        media_type="application/problem+json",
    )

api_router = APIRouter(prefix=API_PREFIX, tags=["meta"])


@api_router.get("/healthz", tags=["health"])
def api_healthz():
    return {"status": "ok"}


@api_router.get("")
def api_root():
    return {"message": "Cross Sport Tracker API. See /docs."}


v0_router = APIRouter(prefix="/v0")

v0_router.include_router(sports.router)
v0_router.include_router(rulesets.router)
v0_router.include_router(players.router)
v0_router.include_router(matches.router)
v0_router.include_router(leaderboards.router)
v0_router.include_router(streams.router)
v0_router.include_router(tournaments.router)
v0_router.include_router(auth.router)
v0_router.include_router(badges.router)
v0_router.include_router(clubs.router)

api_router.include_router(v0_router)

app.include_router(api_router)
app.include_router(player_pages.router)
