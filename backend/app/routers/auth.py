import os
import re
import hashlib
import uuid
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Header, Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from passlib.context import CryptContext
import jwt

from ..db import get_session
from ..models import User, Player
from ..schemas import UserCreate, UserLogin, TokenOut, UserOut, UserUpdate


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
  token = create_token(user)
  return TokenOut(access_token=token)


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
  token = create_token(user)
  return TokenOut(access_token=token)


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
async def read_me(user: User = Depends(get_current_user)):
  return UserOut(id=user.id, username=user.username, is_admin=user.is_admin)


@router.put("/me", response_model=TokenOut)
async def update_me(
    body: UserUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
  if body.username and body.username != user.username:
    existing = (
        await session.execute(select(User).where(User.username == body.username))
    ).scalar_one_or_none()
    if existing:
      raise HTTPException(status_code=400, detail="username exists")
    user.username = body.username
    player = (
        await session.execute(select(Player).where(Player.user_id == user.id))
    ).scalar_one_or_none()
    if player:
      player.name = body.username
  if body.password:
    user.password_hash = pwd_context.hash(body.password)
  await session.commit()
  await session.refresh(user)
  token = create_token(user)
  return TokenOut(access_token=token)
