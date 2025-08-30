# backend/app/main.py
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from .routers import sports, rulesets, players, matches, leaderboards, streams
import os

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")

app = FastAPI(
    title="Cross Sport Tracker API",
    version="0.1.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(status_code=400, content={"detail": exc.errors()})

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in ALLOWED_ORIGINS if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
