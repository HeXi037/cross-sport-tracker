from pathlib import Path
import logging
import os

from fastapi import APIRouter, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sentry_sdk.integrations.fastapi import FastApiIntegration
import sentry_sdk
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
    notifications,
)
from .routes import player as player_pages
from .exceptions import DomainException, ProblemDetail
from .config import API_PREFIX

logger = logging.getLogger(__name__)
SENTRY_DSN = os.getenv("SENTRY_DSN")


def _parse_sample_rate(env_var: str, default: float = 0.0) -> float:
    raw_value = os.getenv(env_var)
    if raw_value is None:
        return default

    try:
        value = float(raw_value)
    except ValueError:
        logger.warning(
            "%s is not a valid float (got %r); defaulting to %.2f",
            env_var,
            raw_value,
            default,
        )
        return default

    if value < 0:
        logger.warning("%s cannot be negative; defaulting to %.2f", env_var, default)
        return default

    return value


def _init_sentry() -> None:
    if not SENTRY_DSN:
        logger.info("SENTRY_DSN not provided; skipping Sentry initialization.")
        return

    environment = (os.getenv("SENTRY_ENVIRONMENT") or "").strip() or None
    traces_sample_rate = _parse_sample_rate("SENTRY_TRACES_SAMPLE_RATE", default=0.0)
    profiles_sample_rate = _parse_sample_rate(
        "SENTRY_PROFILES_SAMPLE_RATE", default=0.0
    )

    sentry_sdk.init(
        dsn=SENTRY_DSN,
        integrations=[FastApiIntegration()],
        environment=environment,
        traces_sample_rate=traces_sample_rate,
        profiles_sample_rate=profiles_sample_rate,
    )
    logger.info(
        "Initialized Sentry%s",
        f" (environment={environment})" if environment else "",
    )


_init_sentry()


def _parse_sample_rate(env_var: str, default: float = 0.0) -> float:
    raw_value = os.getenv(env_var)
    if raw_value is None:
        return default

    try:
        value = float(raw_value)
    except ValueError:
        logger.warning(
            "%s is not a valid float (got %r); defaulting to %.2f",
            env_var,
            raw_value,
            default,
        )
        return default

    if value < 0:
        logger.warning("%s cannot be negative; defaulting to %.2f", env_var, default)
        return default

    return value


def _init_sentry() -> None:
    dsn = os.getenv("SENTRY_DSN")
    if not dsn:
        logger.info("SENTRY_DSN not provided; skipping Sentry initialization.")
        return

    environment = (os.getenv("SENTRY_ENVIRONMENT") or "").strip() or None
    traces_sample_rate = _parse_sample_rate("SENTRY_TRACES_SAMPLE_RATE", default=0.0)
    profiles_sample_rate = _parse_sample_rate(
        "SENTRY_PROFILES_SAMPLE_RATE", default=0.0
    )

    sentry_sdk.init(
        dsn=dsn,
        integrations=[FastApiIntegration()],
        environment=environment,
        traces_sample_rate=traces_sample_rate,
        profiles_sample_rate=profiles_sample_rate,
    )
    logger.info(
        "Initialized Sentry%s",
        f" (environment={environment})" if environment else "",
    )


_init_sentry()

# -----------------------------------------------------------------------------
# CORS configuration
# -----------------------------------------------------------------------------
allowed_origins_raw = os.getenv("ALLOWED_ORIGINS", "").strip()

if not allowed_origins_raw:
    raise ValueError(
        "ALLOWED_ORIGINS environment variable must be set to a comma-separated "
        "list of trusted origins."
    )

ALLOWED_ORIGINS = [o.strip() for o in allowed_origins_raw.split(",") if o.strip()]

if not ALLOWED_ORIGINS:
    raise ValueError("ALLOWED_ORIGINS must contain at least one non-empty origin.")
ALLOW_CREDENTIALS = os.getenv("ALLOW_CREDENTIALS", "true").lower() == "true"

# Fail fast if misconfigured: credentials + wildcard origins is unsafe
if "*" in ALLOWED_ORIGINS:
    raise ValueError(
        "ALLOWED_ORIGINS cannot include '*' (wildcard). Specify explicit, trusted origins."
    )

# -----------------------------------------------------------------------------
# FastAPI app
# -----------------------------------------------------------------------------
app = FastAPI(
    title="Cross Sport Tracker API",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# Rate limiting
app.state.limiter = auth.limiter
app.add_exception_handler(RateLimitExceeded, auth.rate_limit_handler)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=ALLOW_CREDENTIALS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Fail fast if JWT_SECRET is missing or weak
auth.get_jwt_secret()

# -----------------------------------------------------------------------------
# Static files
# -----------------------------------------------------------------------------
# Allow overriding static directory via env; default to package-local ./static
STATIC_DIR = Path(os.getenv("STATIC_DIR") or (Path(__file__).resolve().parent / "static"))
STATIC_DIR.mkdir(parents=True, exist_ok=True)

logger.info("API_PREFIX=%r", API_PREFIX)
logger.info("Mounting static at %s/static -> %s", API_PREFIX, STATIC_DIR)

# Serve at /api/static/* when API_PREFIX is '/api'
app.mount(f"{API_PREFIX}/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# -----------------------------------------------------------------------------
# Health checks
# -----------------------------------------------------------------------------
@app.get("/healthz", tags=["health"])  # Unprefixed for reverse proxy / uptime checks
def root_healthz():
    return {"status": "ok"}


@app.post(f"{API_PREFIX}/sentry-test", tags=["health"])
def sentry_test_check():
    if not SENTRY_DSN:
        raise HTTPException(status_code=400, detail="Sentry is not configured (SENTRY_DSN missing)")

    event_id = sentry_sdk.capture_message("Sentry self-test trigger", level="info")
    return {"status": "sent", "eventId": str(event_id)}


# -----------------------------------------------------------------------------
# Error handling
# -----------------------------------------------------------------------------
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

# -----------------------------------------------------------------------------
# Routers
# -----------------------------------------------------------------------------
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
v0_router.include_router(notifications.router)

api_router.include_router(v0_router)
app.include_router(api_router)
app.include_router(player_pages.router)
