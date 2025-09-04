import os
import re
import hashlib
import uuid
import secrets
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Header, Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from passlib.context import CryptContext
import jwt
import httpx

from ..db import get_session
from ..models import User, Player, PasswordResetToken, RefreshToken
from ..schemas import (
    UserCreate,
    UserLogin,
    TokenOut,
    PasswordResetRequest,
    PasswordResetConfirm,
    UserOut,
    UserUpdate,
)


def get_jwt_secret() -> str:
    secret = os.getenv("JWT_SECRET")
    if not secret:
        raise RuntimeError("JWT_SECRET environment variable is required")
    if len(secret) < 32 or secret.lower() in {"secret", "changeme", "default"}:
        raise RuntimeError(
            "JWT_SECRET must be at least 32 characters and not a common default"
        )
    return secret


JWT_ALG = "HS256"
JWT_EXPIRE_SECONDS = 3600
RESET_TOKEN_EXPIRE_SECONDS = 3600
REFRESH_TOKEN_EXPIRE_SECONDS = 60 * 60 * 24 * 30


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        parts = [ip.strip() for ip in forwarded.split(",") if ip.strip()]
        if parts:
            trusted = {
                ip.strip()
                for ip in os.getenv("TRUSTED_PROXIES", "").split(",")
                if ip.strip()
            }
            for ip in reversed(parts):
                if ip not in trusted:
                    return ip
            return parts[0]
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip
    return request.client.host if request.client else ""


limiter = Limiter(key_func=_get_client_ip)
router = APIRouter(prefix="/auth", tags=["auth"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(status_code=429, content={"detail": "Too Many Requests"})


def hash_password_sha256(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def is_sha256_digest(hash_str: str) -> bool:
    return bool(re.fullmatch(r"[a-f0-9]{64}", hash_str))


def create_token(user: User) -> str:
    payload = {
        "sub": user.id,
        "username": user.username,
        "is_admin": user.is_admin,
        "exp": datetime.utcnow() + timedelta(seconds=JWT_EXPIRE_SECONDS),
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALG)


def create_refresh_token_record(user: User) -> tuple[str, RefreshToken]:
    token = secrets.token_urlsafe(32)
    token_hash = hash_password_sha256(token)
    rec = RefreshToken(
        token_hash=token_hash,
        user_id=user.id,
        expires_at=datetime.utcnow()
        + timedelta(seconds=REFRESH_TOKEN_EXPIRE_SECONDS),
    )
    return token, rec


def _send_password_reset_token(username: str, token: str) -> None:
    """Send the password reset token to the user via an external service."""
    mailer_url = os.getenv("PASSWORD_RESET_MAILER_URL")
    if not mailer_url:
        raise RuntimeError(
            "PASSWORD_RESET_MAILER_URL environment variable is required"
        )

    api_key = os.getenv("PASSWORD_RESET_MAILER_API_KEY")
    headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}

    try:
        resp = httpx.post(
            mailer_url,
            json={"username": username, "token": token},
            headers=headers,
            timeout=10,
        )
        resp.raise_for_status()
    except Exception as exc:  # pragma: no cover - network failures
        raise RuntimeError("Failed to send password reset token") from exc


@router.post("/signup", response_model=TokenOut)
async def signup(
    body: UserCreate,
    session: AsyncSession = Depends(get_session),
    admin_secret: str | None = Header(default=None, alias="X-Admin-Secret"),
):
    existing = (
        await session.execute(select(User).where(User.username == body.username))
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="username exists")

    existing_player = (
        await session.execute(select(Player).where(Player.name == body.username))
    ).scalar_one_or_none()
    if existing_player and existing_player.user_id is not None:
        raise HTTPException(status_code=400, detail="player exists")

    is_admin = False
    if body.is_admin:
        expected = os.getenv("ADMIN_SECRET")
        if not expected or admin_secret != expected:
            raise HTTPException(status_code=403, detail="invalid admin secret")
        is_admin = True

    uid = uuid.uuid4().hex
    user = User(
        id=uid,
        username=body.username,
        password_hash=pwd_context.hash(body.password),
        is_admin=is_admin,
    )
    session.add(user)
    if existing_player:
        existing_player.user_id = uid
    else:
        player = Player(id=uuid.uuid4().hex, user_id=uid, name=body.username)
        session.add(player)
    await session.commit()
    await session.refresh(user)
    # create refresh token
    await session.execute(
        delete(RefreshToken).where(RefreshToken.user_id == user.id)
    )
    refresh_token, refresh_rec = create_refresh_token_record(user)
    session.add(refresh_rec)
    await session.commit()
    token = create_token(user)
    resp = JSONResponse(status_code=200, content={"access_token": token})
    resp.set_cookie(
        "refresh_token",
        refresh_token,
        httponly=True,
        max_age=REFRESH_TOKEN_EXPIRE_SECONDS,
    )
    return resp


@router.post("/login", response_model=TokenOut)
@limiter.limit("5/minute")
async def login(
    request: Request,
    body: UserLogin,
    session: AsyncSession = Depends(get_session),
):
    user = (
        await session.execute(select(User).where(User.username == body.username))
    ).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="invalid credentials")
    stored = user.password_hash
    if is_sha256_digest(stored):
        if hash_password_sha256(body.password) != stored:
            raise HTTPException(status_code=401, detail="invalid credentials")
    else:
        if not pwd_context.verify(body.password, stored):
            raise HTTPException(status_code=401, detail="invalid credentials")
    # remove existing refresh tokens for this user
    await session.execute(
        delete(RefreshToken).where(RefreshToken.user_id == user.id)
    )
    refresh_token, refresh_rec = create_refresh_token_record(user)
    session.add(refresh_rec)
    await session.commit()
    token = create_token(user)
    resp = JSONResponse(status_code=200, content={"access_token": token})
    resp.set_cookie(
        "refresh_token",
        refresh_token,
        httponly=True,
        max_age=REFRESH_TOKEN_EXPIRE_SECONDS,
    )
    return resp


@router.post("/reset/request")
@limiter.limit("5/minute")
async def reset_request(
    request: Request,
    body: PasswordResetRequest,
    session: AsyncSession = Depends(get_session),
):
    user = (
        await session.execute(select(User).where(User.username == body.username))
    ).scalar_one_or_none()
    if user:
        await session.execute(
            delete(PasswordResetToken).where(PasswordResetToken.user_id == user.id)
        )
        token = secrets.token_urlsafe(32)
        token_hash = hash_password_sha256(token)
        rec = PasswordResetToken(
            token_hash=token_hash,
            user_id=user.id,
            expires_at=datetime.utcnow()
            + timedelta(seconds=RESET_TOKEN_EXPIRE_SECONDS),
        )
        session.add(rec)
        await session.commit()
        _send_password_reset_token(user.username, token)
    return {"detail": "If the account exists, reset instructions have been sent."}


@router.post("/reset/confirm")
async def reset_confirm(
    body: PasswordResetConfirm,
    session: AsyncSession = Depends(get_session),
):
    user = (
        await session.execute(select(User).where(User.username == body.username))
    ).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=400, detail="invalid token")
    token_hash = hash_password_sha256(body.token)
    rec = await session.get(PasswordResetToken, token_hash)
    if not rec or rec.user_id != user.id or rec.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="invalid token")
    user.password_hash = pwd_context.hash(body.new_password)
    await session.delete(rec)
    await session.commit()
    return JSONResponse(status_code=204, content=None)


async def get_current_user(
    authorization: str | None = Header(None),
    session: AsyncSession = Depends(get_session),
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="missing token")
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALG])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="invalid token")
    uid = payload.get("sub")
    user = await session.get(User, uid)
    if not user:
        raise HTTPException(status_code=401, detail="user not found")
    return user


@router.get("/me", response_model=UserOut)
async def read_me(current: User = Depends(get_current_user)):
    """Return the current user's profile."""
    return UserOut(
        id=current.id, username=current.username, is_admin=current.is_admin
    )


@router.put("/me", response_model=TokenOut)
async def update_me(
    body: UserUpdate,
    current: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    if body.username and body.username != current.username:
        existing = (
            await session.execute(
                select(User).where(User.username == body.username)
            )
        ).scalar_one_or_none()
        if existing:
            raise HTTPException(status_code=400, detail="username exists")
        existing_player = (
            await session.execute(select(Player).where(Player.name == body.username))
        ).scalar_one_or_none()
        if existing_player and existing_player.user_id != current.id:
            raise HTTPException(status_code=400, detail="player exists")
        player = (
            await session.execute(select(Player).where(Player.user_id == current.id))
        ).scalar_one_or_none()
        if player:
            player.name = body.username
        current.username = body.username
    if body.password:
        current.password_hash = pwd_context.hash(body.password)
    await session.commit()
    await session.refresh(current)
    token = create_token(current)
    return TokenOut(access_token=token)


@router.post("/refresh", response_model=TokenOut)
async def refresh(
    request: Request, session: AsyncSession = Depends(get_session)
):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="missing token")
    token_hash = hash_password_sha256(token)
    rec = await session.get(RefreshToken, token_hash)
    if not rec or rec.expires_at < datetime.utcnow():
        raise HTTPException(status_code=401, detail="invalid token")
    user = await session.get(User, rec.user_id)
    if not user:
        raise HTTPException(status_code=401, detail="user not found")
    await session.delete(rec)
    refresh_token, refresh_rec = create_refresh_token_record(user)
    session.add(refresh_rec)
    await session.commit()
    access_token = create_token(user)
    resp = JSONResponse(status_code=200, content={"access_token": access_token})
    resp.set_cookie(
        "refresh_token",
        refresh_token,
        httponly=True,
        max_age=REFRESH_TOKEN_EXPIRE_SECONDS,
    )
    return resp


@router.post("/logout")
async def logout(
    request: Request, session: AsyncSession = Depends(get_session)
):
    token = request.cookies.get("refresh_token")
    if token:
        token_hash = hash_password_sha256(token)
        rec = await session.get(RefreshToken, token_hash)
        if rec:
            await session.delete(rec)
            await session.commit()
    resp = JSONResponse(status_code=204, content=None)
    resp.delete_cookie("refresh_token")
    return resp
