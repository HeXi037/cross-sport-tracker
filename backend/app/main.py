# backend/app/main.py
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from .routers import sports, rulesets, players, matches, leaderboards, streams
from .exceptions import DomainException, ProblemDetail
import os

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")

app = FastAPI(
    title="Cross Sport Tracker API",
    version="0.1.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in ALLOWED_ORIGINS if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
