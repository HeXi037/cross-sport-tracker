# backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers import sports, rulesets, players, matches, leaderboards, streams
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS or ["*"],
    allow_credentials=ALLOW_CREDENTIALS,
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
