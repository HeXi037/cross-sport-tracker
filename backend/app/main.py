from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

from .routers import sports, rulesets, players, matches, leaderboards


async def http_error_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "type": "about:blank",
            "title": exc.detail,
            "status": exc.status_code,
        },
        media_type="application/problem+json",
    )


async def validation_error_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "type": "about:blank",
            "title": "Validation Error",
            "status": 422,
            "detail": exc.errors(),
        },
        media_type="application/problem+json",
    )


app = FastAPI()
app.add_exception_handler(HTTPException, http_error_handler)
app.add_exception_handler(RequestValidationError, validation_error_handler)

app.include_router(sports.router)
app.include_router(rulesets.router)
app.include_router(players.router)
app.include_router(matches.router)
app.include_router(leaderboards.router)
