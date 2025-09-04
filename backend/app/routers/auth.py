import os
import re
import hashlib
import uuid
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Header, Request, Response
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from passlib.context import CryptContext
import jwt

from ..db import get_session
from ..models import User, Player, RefreshToken
from ..schemas import UserCreate, UserLogin, TokenOut


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
REFRESH_EXPIRE_SECONDS = 30 * 24 * 3600


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


async def issue_refresh_token(session: AsyncSession, user: User) -> str:
  await session.execute(delete(RefreshToken).where(RefreshToken.user_id == user.id))
  token = uuid.uuid4().hex
  rt = RefreshToken(
      token=token,
      user_id=user.id,
      expires_at=datetime.utcnow() + timedelta(seconds=REFRESH_EXPIRE_SECONDS),
  )
  session.add(rt)
  await session.commit()
  return token


@router.post("/signup", response_model=TokenOut)
async def signup(
    body: UserCreate,
    response: Response,
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
  access = create_token(user)
  refresh = await issue_refresh_token(session, user)
  response.set_cookie(
      "refresh_token",
      refresh,
      httponly=True,
      max_age=REFRESH_EXPIRE_SECONDS,
      samesite="lax",
  )
  return TokenOut(access_token=access)


@router.post("/login", response_model=TokenOut)
@limiter.limit("5/minute")
async def login(
    request: Request,
    body: UserLogin,
    response: Response,
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
  access = create_token(user)
  refresh = await issue_refresh_token(session, user)
  response.set_cookie(
      "refresh_token",
      refresh,
      httponly=True,
      max_age=REFRESH_EXPIRE_SECONDS,
      samesite="lax",
  )
  return TokenOut(access_token=access)


@router.post("/refresh", response_model=TokenOut)
async def refresh(
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
):
  token = request.cookies.get("refresh_token")
  if not token:
    raise HTTPException(status_code=401, detail="missing refresh token")
  db_token = await session.get(RefreshToken, token)
  if not db_token or db_token.expires_at < datetime.utcnow():
    raise HTTPException(status_code=401, detail="invalid refresh token")
  user = await session.get(User, db_token.user_id)
  if not user:
    raise HTTPException(status_code=401, detail="user not found")
  await session.delete(db_token)
  await session.commit()
  refresh_token = await issue_refresh_token(session, user)
  access_token = create_token(user)
  response.set_cookie(
      "refresh_token",
      refresh_token,
      httponly=True,
      max_age=REFRESH_EXPIRE_SECONDS,
      samesite="lax",
  )
  return TokenOut(access_token=access_token)


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
