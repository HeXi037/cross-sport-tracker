import os
import uuid
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Header, Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from passlib.context import CryptContext
import jwt

from ..db import get_session
from ..models import User, Player, RefreshToken
from ..schemas import (
    UserCreate,
    UserLogin,
    TokenOut,
    UserOut,
    UserUpdate,
    RefreshRequest,
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
REFRESH_TOKEN_EXPIRE_DAYS = 30


def _get_client_ip(request: Request) -> str:
  forwarded = request.headers.get("X-Forwarded-For")
  if forwarded:
    parts = [ip.strip() for ip in forwarded.split(",") if ip.strip()]
    if parts:
      return parts[-1]
  real_ip = request.headers.get("X-Real-IP")
  if real_ip:
    return real_ip
  return request.client.host if request.client else ""


limiter = Limiter(key_func=_get_client_ip)
router = APIRouter(prefix="/auth", tags=["auth"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
  return JSONResponse(status_code=429, content={"detail": "Too Many Requests"})


async def create_token(user: User, session: AsyncSession) -> tuple[str, str]:
  payload = {
      "sub": user.id,
      "username": user.username,
      "is_admin": user.is_admin,
      "exp": datetime.utcnow() + timedelta(seconds=JWT_EXPIRE_SECONDS),
  }
  access_token = jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALG)
  refresh_token = uuid.uuid4().hex
  session.add(
      RefreshToken(
          id=refresh_token,
          user_id=user.id,
          expires_at=datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
          revoked=False,
      )
  )
  return access_token, refresh_token


@router.post("/signup", response_model=TokenOut)
async def signup(
    body: UserCreate,
    session: AsyncSession = Depends(get_session),
    admin_secret: str | None = Header(default=None, alias="X-Admin-Secret"),
):
  username = body.username.strip().lower()
  existing = (
      await session.execute(
          select(User).where(func.lower(User.username) == username)
      )
  ).scalar_one_or_none()
  if existing:
    raise HTTPException(status_code=400, detail="username exists")

  existing_player = (
      await session.execute(
          select(Player).where(func.lower(Player.name) == username)
      )
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
      username=username,
      password_hash=pwd_context.hash(body.password),
      is_admin=is_admin,
  )
  session.add(user)
  if existing_player:
    existing_player.user_id = uid
    existing_player.name = username
  else:
    player = Player(id=uuid.uuid4().hex, user_id=uid, name=username)
    session.add(player)
  access_token, refresh_token = await create_token(user, session)
  await session.commit()
  return TokenOut(access_token=access_token, refresh_token=refresh_token)


@router.post("/login", response_model=TokenOut)
@limiter.limit("5/minute")
async def login(
    request: Request,
    body: UserLogin,
    session: AsyncSession = Depends(get_session),
):
  username = body.username.strip().lower()
  user = (
      await session.execute(
          select(User).where(func.lower(User.username) == username)
      )
  ).scalar_one_or_none()
  if not user:
    raise HTTPException(status_code=401, detail="invalid credentials")
  if not pwd_context.verify(body.password, user.password_hash):
    raise HTTPException(status_code=401, detail="invalid credentials")
  access_token, refresh_token = await create_token(user, session)
  await session.commit()
  return TokenOut(access_token=access_token, refresh_token=refresh_token)


async def get_current_user(
    authorization: str | None = Header(None),
    session: AsyncSession = Depends(get_session),
) -> User:
  if not authorization or not authorization.lower().startswith("bearer "):
    raise HTTPException(status_code=401, detail="missing token")
  token = authorization.split(" ", 1)[1]
  try:
    payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALG])
  except jwt.ExpiredSignatureError:
    raise HTTPException(status_code=401, detail="token expired")
  except jwt.PyJWTError:
    raise HTTPException(status_code=401, detail="invalid token")
  uid = payload.get("sub")
  user = await session.get(User, uid)
  if not user:
    raise HTTPException(status_code=401, detail="user not found")
  return user


@router.get("/me", response_model=UserOut)
async def read_me(current: User = Depends(get_current_user)):
  return UserOut(id=current.id, username=current.username, is_admin=current.is_admin)


@router.put("/me", response_model=TokenOut)
async def update_me(
    body: UserUpdate,
    current: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
  if body.username:
    new_username = body.username.strip().lower()
    if new_username != current.username:
      existing = (
          await session.execute(
              select(User).where(func.lower(User.username) == new_username)
          )
      ).scalar_one_or_none()
      if existing and existing.id != current.id:
        raise HTTPException(status_code=400, detail="username exists")

      existing_player = (
          await session.execute(
              select(Player).where(func.lower(Player.name) == new_username)
          )
      ).scalar_one_or_none()
      if existing_player:
        raise HTTPException(status_code=400, detail="player exists")

      current.username = new_username
      player = (
          await session.execute(select(Player).where(Player.user_id == current.id))
      ).scalar_one_or_none()
      if player:
        player.name = new_username
  if body.password:
    current.password_hash = pwd_context.hash(body.password)
  try:
    await session.commit()
  except IntegrityError as e:
    await session.rollback()
    if "player" in str(e.orig):
      raise HTTPException(status_code=400, detail="player exists")
    raise HTTPException(status_code=400, detail="username exists")
  access_token, refresh_token = await create_token(current, session)
  await session.commit()
  return TokenOut(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=TokenOut)
async def refresh_tokens(
    body: RefreshRequest, session: AsyncSession = Depends(get_session)
):
  token = await session.get(RefreshToken, body.refresh_token)
  if (
      not token
      or token.revoked
      or token.expires_at < datetime.utcnow()
  ):
    raise HTTPException(status_code=401, detail="invalid refresh token")
  user = await session.get(User, token.user_id)
  if not user:
    raise HTTPException(status_code=401, detail="user not found")
  token.revoked = True
  access_token, refresh_token = await create_token(user, session)
  await session.commit()
  return TokenOut(access_token=access_token, refresh_token=refresh_token)


@router.post("/revoke")
async def revoke_token(
    body: RefreshRequest, session: AsyncSession = Depends(get_session)
):
  token = await session.get(RefreshToken, body.refresh_token)
  if token:
    token.revoked = True
    await session.commit()
  return {"status": "ok"}
