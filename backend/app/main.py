# backend/app/main.py
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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
)
from .routes import player as player_pages
from .exceptions import DomainException, ProblemDetail
import os


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
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
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


@app.exception_handler(DomainException)
async def domain_exception_handler(request: Request, exc: DomainException) -> JSONResponse:
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


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
    problem = ProblemDetail(title=detail, detail=detail, status=exc.status_code)
    return JSONResponse(
        status_code=exc.status_code,
        content=problem.model_dump(),
        media_type="application/problem+json",
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    problem = ProblemDetail(title="Internal Server Error", status=500, detail=str(exc))
    return JSONResponse(
        status_code=500,
        content=problem.model_dump(),
        media_type="application/problem+json",
    )

@app.get("/api/healthz")
def healthz():
    return {"status": "ok"}

@app.get("/api")
def api_root():
    return {"message": "Cross Sport Tracker API. See /api/docs."}

# Mount once with versioning
app.include_router(sports.router,      prefix="/api/v0")
app.include_router(rulesets.router,    prefix="/api/v0")
app.include_router(players.router,     prefix="/api/v0")
app.include_router(matches.router,     prefix="/api/v0")
app.include_router(leaderboards.router, prefix="/api/v0")
app.include_router(streams.router,      prefix="/api/v0")
app.include_router(tournaments.router,  prefix="/api/v0")
app.include_router(auth.router,         prefix="/api/v0")
app.include_router(badges.router,       prefix="/api/v0")
app.include_router(player_pages.router)
