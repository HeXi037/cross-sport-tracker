import os
import hashlib
import uuid
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import jwt

from ..db import get_session
from ..models import User, Player
from ..schemas import UserCreate, UserLogin, TokenOut

JWT_SECRET = os.getenv("JWT_SECRET", "secret")
JWT_ALG = "HS256"
JWT_EXPIRE_SECONDS = 3600

router = APIRouter(prefix="/auth", tags=["auth"])


def hash_password(password: str) -> str:
  return hashlib.sha256(password.encode()).hexdigest()


def create_token(user: User) -> str:
  payload = {
      "sub": user.id,
      "username": user.username,
      "is_admin": user.is_admin,
      "exp": datetime.utcnow() + timedelta(seconds=JWT_EXPIRE_SECONDS),
  }
  return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


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
      password_hash=hash_password(body.password),
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
async def login(body: UserLogin, session: AsyncSession = Depends(get_session)):
  user = (
      await session.execute(select(User).where(User.username == body.username))
  ).scalar_one_or_none()
  if not user or user.password_hash != hash_password(body.password):
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
    payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
  except jwt.PyJWTError:
    raise HTTPException(status_code=401, detail="invalid token")
  uid = payload.get("sub")
  user = await session.get(User, uid)
  if not user:
    raise HTTPException(status_code=401, detail="user not found")
  return user
