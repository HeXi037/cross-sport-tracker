import base64
import json
import os
import uuid
import secrets
import hashlib
import string
import random
from pathlib import Path
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse
from typing import Any, Tuple

import bcrypt
import jwt
from fastapi import APIRouter, Depends, Header, Query, Request, UploadFile, File
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from sqlalchemy import select, func, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import API_PREFIX
from ..db import get_session
from ..models import User, Player, RefreshToken
from ..schemas import (
    UserCreate,
    UserLogin,
    TokenOut,
    UserOut,
    UserUpdate,
    RefreshRequest,
    AdminPasswordResetRequest,
    AdminPasswordResetOut,
    UsernameAvailabilityResponse,
)
from ..services.photo_uploads import save_photo_upload
from ..exceptions import http_problem


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
ACCESS_TOKEN_COOKIE = "access_token"
REFRESH_TOKEN_COOKIE = "refresh_token"
CSRF_COOKIE = "csrf_token"
SESSION_HINT_COOKIE = "session_hint"
COOKIE_PATH = "/"


def _rate_limits_disabled() -> bool:
  return (os.getenv("DISABLE_AUTH_RATE_LIMITS") or "").lower() == "true"


def _load_cookie_settings() -> tuple[str, bool, str | None]:
  raw_samesite = (os.getenv("AUTH_COOKIE_SAMESITE", "lax") or "lax").lower()
  if raw_samesite not in {"lax", "strict", "none"}:
    raise RuntimeError(
        "AUTH_COOKIE_SAMESITE must be one of: lax, strict, none"
    )

  secure = os.getenv("AUTH_COOKIE_SECURE", "true").lower() != "false"
  if raw_samesite == "none" and not secure:
    raise RuntimeError(
        "AUTH_COOKIE_SECURE must be true when AUTH_COOKIE_SAMESITE=none to allow cross-site auth cookies"
    )

  domain = os.getenv("AUTH_COOKIE_DOMAIN") or None
  return raw_samesite, secure, domain


COOKIE_SAMESITE, COOKIE_SECURE, COOKIE_DOMAIN = _load_cookie_settings()


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

FLAGGED_IPS = {
    ip.strip() for ip in os.getenv("FLAGGED_IPS", "").split(",") if ip.strip()
}

USER_UPLOAD_DIR = Path(__file__).resolve().parent.parent / "static" / "users"
USER_UPLOAD_URL_PREFIX = f"{API_PREFIX}/static/users"


def _delete_user_photo_file(photo_url: str | None) -> None:
  if not photo_url:
    return

  parsed = urlparse(photo_url)
  path = parsed.path if parsed.scheme or parsed.netloc else photo_url
  if not path or not path.startswith(str(USER_UPLOAD_URL_PREFIX)):
    return

  relative = path[len(str(USER_UPLOAD_URL_PREFIX)) :].lstrip("/")
  if not relative or "/" in relative or relative.startswith(".."):
    return

  file_path = USER_UPLOAD_DIR / relative
  try:
    file_path.unlink(missing_ok=True)
  except OSError:
    # Removing the file is a best-effort operation; ignore filesystem errors.
    pass


def signup_rate_limit(key: str) -> str:
    if _rate_limits_disabled():
        return "1000/second"
    return "1/hour" if key in FLAGGED_IPS else "5/minute"


def login_rate_limit() -> str:
  if _rate_limits_disabled():
    return "1000/second"
  return "5/minute"


class _BcryptContext:
  def hash(self, password: str) -> str:
    if not isinstance(password, str):
      raise TypeError("password must be a string")
    password_bytes = password.encode("utf-8")
    hashed = bcrypt.hashpw(password_bytes, bcrypt.gensalt())
    return hashed.decode("utf-8")

  def verify(self, password: str, hashed: str) -> bool:
    if not isinstance(password, str) or not isinstance(hashed, str):
      return False
    try:
      return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
      return False


pwd_context = _BcryptContext()


async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
  detail = exc.detail if isinstance(exc.detail, str) else ""
  if detail:
    message = f"rate limit exceeded: {detail}"
  else:
    message = "rate limit exceeded: please wait before submitting another request."
  return JSONResponse(
      status_code=429,
      content={
          "detail": message,
          "code": "rate_limit_exceeded",
      },
  )


def _utcnow() -> datetime:
  """Return a timezone-aware UTC ``datetime``."""

  return datetime.now(timezone.utc)


def _as_utc(dt: datetime) -> datetime:
  """Coerce a ``datetime`` into a UTC-aware value."""

  if dt.tzinfo is None:
    return dt.replace(tzinfo=timezone.utc)
  return dt.astimezone(timezone.utc)


def _generate_temporary_password(length: int = 16) -> str:
  if length < 12:
    raise ValueError("Temporary passwords must be at least 12 characters long")
  lower = string.ascii_lowercase
  upper = string.ascii_uppercase
  digits = string.digits
  symbols = "!@#$%^&*()-_=+"
  all_chars = lower + upper + digits + symbols
  required = [
      secrets.choice(lower),
      secrets.choice(upper),
      secrets.choice(digits),
      secrets.choice(symbols),
  ]
  remaining = [secrets.choice(all_chars) for _ in range(length - len(required))]
  password_chars = required + remaining
  random.SystemRandom().shuffle(password_chars)
  return "".join(password_chars)


def _generate_csrf_token() -> str:
  return secrets.token_urlsafe(32)


async def create_token(
    user: User, session: AsyncSession, *, family_id: str | None = None
) -> tuple[str, str, str]:
  await session.flush()
  csrf_token = _generate_csrf_token()
  now = _utcnow()
  payload = {
      "sub": user.id,
      "username": user.username,
      "is_admin": user.is_admin,
      "must_change_password": user.must_change_password,
      "exp": now + timedelta(seconds=JWT_EXPIRE_SECONDS),
      "csrf": csrf_token,
  }
  access_token = jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALG)
  refresh_token = secrets.token_urlsafe()
  token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
  session.add(
      RefreshToken(
          token_hash=token_hash,
          user_id=user.id,
          expires_at=now + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
          revoked=False,
          last_used_at=now,
          family_id=family_id or uuid.uuid4().hex,
      )
  )
  return access_token, refresh_token, csrf_token


async def _revoke_all_refresh_tokens(session: AsyncSession, user_id: str) -> None:
  await session.execute(
      update(RefreshToken)
      .where(RefreshToken.user_id == user_id)
      .values(revoked=True, last_used_at=_utcnow())
  )


async def _latest_active_refresh_token(
    session: AsyncSession, user_id: str
) -> RefreshToken | None:
  return (
      (
          await session.execute(
              select(RefreshToken)
              .where(RefreshToken.user_id == user_id)
              .where(RefreshToken.revoked.is_(False))
              .order_by(RefreshToken.last_used_at.desc(), RefreshToken.expires_at.desc())
              .limit(1)
          )
      ).scalar_one_or_none()
  )


def _build_session_hint(user: User) -> str:
  data = {
      "uid": user.id,
      "username": user.username,
      "is_admin": user.is_admin,
      "must_change_password": user.must_change_password,
  }
  serialized = json.dumps(data, separators=(",", ":"), ensure_ascii=False)
  return base64.urlsafe_b64encode(serialized.encode("utf-8")).decode("ascii")


def _attach_auth_cookies(
    response: JSONResponse,
    user: User,
    access_token: str,
    refresh_token: str,
    csrf_token: str,
    session_hint: str | None = None,
) -> None:
  access_max_age = JWT_EXPIRE_SECONDS
  refresh_max_age = REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60
  hint = session_hint or _build_session_hint(user)

  response.set_cookie(
      ACCESS_TOKEN_COOKIE,
      access_token,
      max_age=access_max_age,
      path=COOKIE_PATH,
      secure=COOKIE_SECURE,
      httponly=True,
      samesite=COOKIE_SAMESITE,
      domain=COOKIE_DOMAIN,
  )
  response.set_cookie(
      REFRESH_TOKEN_COOKIE,
      refresh_token,
      max_age=refresh_max_age,
      path=COOKIE_PATH,
      secure=COOKIE_SECURE,
      httponly=True,
      samesite=COOKIE_SAMESITE,
      domain=COOKIE_DOMAIN,
  )
  response.set_cookie(
      CSRF_COOKIE,
      csrf_token,
      max_age=access_max_age,
      path=COOKIE_PATH,
      secure=COOKIE_SECURE,
      httponly=False,
      samesite=COOKIE_SAMESITE,
      domain=COOKIE_DOMAIN,
  )
  response.set_cookie(
      SESSION_HINT_COOKIE,
      hint,
      max_age=refresh_max_age,
      path=COOKIE_PATH,
      secure=COOKIE_SECURE,
      httponly=False,
      samesite=COOKIE_SAMESITE,
      domain=COOKIE_DOMAIN,
  )


def _clear_auth_cookies(response: JSONResponse) -> None:
  cookies_to_clear = [
      ACCESS_TOKEN_COOKIE,
      REFRESH_TOKEN_COOKIE,
      CSRF_COOKIE,
      SESSION_HINT_COOKIE,
  ]
  for cookie in cookies_to_clear:
    response.set_cookie(
        cookie,
        "",
        max_age=0,
        path=COOKIE_PATH,
        secure=COOKIE_SECURE,
        httponly=cookie in {ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE},
        samesite=COOKIE_SAMESITE,
        domain=COOKIE_DOMAIN,
    )


def _extract_bearer_token(request: Request, authorization: str | None) -> str:
  if authorization and authorization.lower().startswith("bearer "):
    return authorization.split(" ", 1)[1]

  cookie_token = request.cookies.get(ACCESS_TOKEN_COOKIE)
  if cookie_token:
    return cookie_token

  raise http_problem(
      status_code=401,
      detail="missing token",
      code="auth_missing_token",
  )


async def _resolve_user_and_payload(
    request: Request, authorization: str | None, session: AsyncSession
) -> Tuple[User, dict[str, Any]]:
  token = _extract_bearer_token(request, authorization)
  try:
    payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALG])
  except jwt.ExpiredSignatureError:
    raise http_problem(
        status_code=401,
        detail="token expired",
        code="auth_token_expired",
    )
  except jwt.PyJWTError:
    raise http_problem(
        status_code=401,
        detail="invalid token",
        code="auth_invalid_token",
    )
  uid = payload.get("sub")
  user = await session.get(User, uid)
  if not user:
    raise http_problem(
        status_code=401,
        detail="user not found",
        code="auth_user_not_found",
    )
  return user, payload


def _require_csrf_token(csrf_header: str | None, payload: dict[str, Any]) -> None:
  expected = payload.get("csrf")
  if not isinstance(expected, str) or not expected:
    raise http_problem(
        status_code=403,
        detail="missing CSRF token",
        code="auth_csrf_missing",
    )
  if not csrf_header or not isinstance(csrf_header, str):
    raise http_problem(
        status_code=403,
        detail="missing CSRF token",
        code="auth_csrf_missing",
    )
  if not secrets.compare_digest(expected, csrf_header):
    raise http_problem(
        status_code=403,
        detail="invalid CSRF token",
        code="auth_csrf_invalid",
    )


@router.get(
    "/signup/username-availability",
    response_model=UsernameAvailabilityResponse,
)
async def username_availability(
    username: str = Query(..., min_length=1, max_length=50),
    session: AsyncSession = Depends(get_session),
) -> UsernameAvailabilityResponse:
  trimmed = username.strip()
  if not trimmed:
    raise http_problem(
        status_code=400,
        detail="username required",
        code="auth_username_required",
    )

  normalized_username = trimmed.lower()
  existing_user = (
      await session.execute(
          select(User).where(func.lower(User.username) == normalized_username)
      )
  ).scalar_one_or_none()
  if existing_user:
    return UsernameAvailabilityResponse(available=False)

  existing_player = (
      await session.execute(
          select(Player).where(func.lower(Player.name) == normalized_username)
      )
  ).scalar_one_or_none()
  if existing_player and existing_player.user_id is not None:
    return UsernameAvailabilityResponse(available=False)

  return UsernameAvailabilityResponse(available=True)


@router.post("/signup", response_model=TokenOut)
@limiter.limit(signup_rate_limit)
async def signup(
    request: Request,
    body: UserCreate,
    session: AsyncSession = Depends(get_session),
    admin_secret: str | None = Header(default=None, alias="X-Admin-Secret"),
):
  username = body.username.strip()
  if not username:
    raise http_problem(
        status_code=400,
        detail="username required",
        code="auth_username_required",
    )
  normalized_username = username.lower()
  existing = (
      await session.execute(
          select(User).where(func.lower(User.username) == normalized_username)
      )
  ).scalar_one_or_none()
  if existing:
    raise http_problem(status_code=400, detail="username exists", code="auth_username_exists")

  existing_player = (
      await session.execute(
          select(Player).where(func.lower(Player.name) == normalized_username)
      )
  ).scalar_one_or_none()
  if existing_player and existing_player.user_id is not None:
    raise http_problem(status_code=400, detail="player exists", code="auth_player_exists")

  is_admin = False
  if body.is_admin:
    expected = os.getenv("ADMIN_SECRET")
    if not expected or admin_secret != expected:
      raise http_problem(
          status_code=403,
          detail="invalid admin secret",
          code="auth_invalid_admin_secret",
      )
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
  await _revoke_all_refresh_tokens(session, uid)
  access_token, refresh_token, csrf_token = await create_token(user, session)
  await session.commit()
  payload = TokenOut(
      access_token=access_token,
      refresh_token=refresh_token,
      csrf_token=csrf_token,
      must_change_password=user.must_change_password,
      session_hint=_build_session_hint(user),
  )
  response = JSONResponse(content=payload.model_dump(by_alias=True))
  _attach_auth_cookies(
      response,
      user,
      access_token,
      refresh_token,
      csrf_token,
      payload.session_hint,
  )
  return response


@router.post("/login", response_model=TokenOut)
@limiter.limit(login_rate_limit)
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
    raise http_problem(
        status_code=401,
        detail="invalid credentials",
        code="auth_invalid_credentials",
    )
  if not pwd_context.verify(body.password, user.password_hash):
    raise http_problem(
        status_code=401,
        detail="invalid credentials",
        code="auth_invalid_credentials",
  )
  await _revoke_all_refresh_tokens(session, user.id)
  access_token, refresh_token, csrf_token = await create_token(user, session)
  await session.commit()
  payload = TokenOut(
      access_token=access_token,
      refresh_token=refresh_token,
      csrf_token=csrf_token,
      must_change_password=user.must_change_password,
      session_hint=_build_session_hint(user),
  )
  response = JSONResponse(content=payload.model_dump(by_alias=True))
  _attach_auth_cookies(
      response,
      user,
      access_token,
      refresh_token,
      csrf_token,
      payload.session_hint,
  )
  return response


async def get_current_user(
    request: Request,
    authorization: str | None = Header(None),
    session: AsyncSession = Depends(get_session),
) -> User:
  user, _ = await _resolve_user_and_payload(request, authorization, session)
  return user


async def get_current_user_with_csrf(
    request: Request,
    authorization: str | None = Header(None),
    csrf_token: str | None = Header(None, alias="X-CSRF-Token"),
    session: AsyncSession = Depends(get_session),
) -> User:
  user, payload = await _resolve_user_and_payload(request, authorization, session)
  _require_csrf_token(csrf_token, payload)
  return user


@router.get("/me", response_model=UserOut)
async def read_me(current: User = Depends(get_current_user)):
  return UserOut(
      id=current.id,
      username=current.username,
      is_admin=current.is_admin,
      photo_url=current.photo_url,
      must_change_password=current.must_change_password,
  )


@router.post("/me/photo", response_model=UserOut)
async def update_my_photo(
    file: UploadFile = File(...),
    current: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
  filename = await save_photo_upload(file, USER_UPLOAD_DIR)
  current.photo_url = f"{USER_UPLOAD_URL_PREFIX}/{filename}"

  player = (
      await session.execute(select(Player).where(Player.user_id == current.id))
  ).scalar_one_or_none()
  if player:
    player.photo_url = current.photo_url

  await session.commit()
  return UserOut(
      id=current.id,
      username=current.username,
      is_admin=current.is_admin,
      photo_url=current.photo_url,
      must_change_password=current.must_change_password,
  )


@router.delete("/me/photo", response_model=UserOut)
async def delete_my_photo(
    current: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
  _delete_user_photo_file(current.photo_url)
  current.photo_url = None

  player = (
      await session.execute(select(Player).where(Player.user_id == current.id))
  ).scalar_one_or_none()
  if player:
    player.photo_url = None

  await session.commit()
  return UserOut(
      id=current.id,
      username=current.username,
      is_admin=current.is_admin,
      photo_url=current.photo_url,
      must_change_password=current.must_change_password,
  )


@router.put("/me", response_model=TokenOut)
async def update_me(
    body: UserUpdate,
    current: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
  password_changed = False
  if body.username:
    new_username = body.username.strip()
    if not new_username:
      raise http_problem(
          status_code=400,
          detail="username required",
          code="auth_username_required",
      )
    normalized = new_username.lower()
    current_normalized = current.username.lower()
    if normalized != current_normalized:
      existing = (
          await session.execute(
              select(User).where(func.lower(User.username) == normalized)
          )
      ).scalar_one_or_none()
      if existing and existing.id != current.id:
        raise http_problem(
            status_code=400,
            detail="username exists",
            code="auth_username_exists",
        )

      existing_player = (
          await session.execute(
              select(Player)
              .where(func.lower(Player.name) == normalized)
              .where(Player.deleted_at.is_(None))
          )
      ).scalar_one_or_none()
      if existing_player and existing_player.user_id not in {None, current.id}:
        raise http_problem(
            status_code=400,
            detail="player exists",
            code="auth_player_exists",
        )

    current.username = new_username
    player = (
        await session.execute(select(Player).where(Player.user_id == current.id))
    ).scalar_one_or_none()
    if player:
      player.name = new_username
  if body.password:
    current.password_hash = pwd_context.hash(body.password)
    current.must_change_password = False
    password_changed = True
  try:
    await session.commit()
  except IntegrityError as e:
    await session.rollback()
    if "player" in str(e.orig):
      raise http_problem(
          status_code=400,
          detail="player exists",
          code="auth_player_exists",
      )
    raise http_problem(
        status_code=400,
        detail="username exists",
        code="auth_username_exists",
    )
  if password_changed:
    await _revoke_all_refresh_tokens(session, current.id)
  access_token, refresh_token, csrf_token = await create_token(current, session)
  await session.commit()
  payload = TokenOut(
      access_token=access_token,
      refresh_token=refresh_token,
      csrf_token=csrf_token,
      must_change_password=current.must_change_password,
      session_hint=_build_session_hint(current),
  )
  response = JSONResponse(content=payload.model_dump(by_alias=True))
  _attach_auth_cookies(
      response,
      current,
      access_token,
      refresh_token,
      csrf_token,
      payload.session_hint,
  )
  return response


@router.post("/admin/reset-password", response_model=AdminPasswordResetOut)
async def admin_reset_password(
    body: AdminPasswordResetRequest,
    current: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
  if not current.is_admin:
    raise http_problem(
        status_code=403,
        detail="forbidden",
        code="admin_forbidden",
    )
  user: User | None
  if body.user_id:
    user = await session.get(User, body.user_id)
  else:
    normalized_username = body.username.lower() if body.username is not None else None
    user = (
        await session.execute(
            select(User).where(func.lower(User.username) == normalized_username)
        )
    ).scalar_one_or_none()
  if not user:
    raise http_problem(
        status_code=404,
        detail="user not found",
        code="auth_user_not_found",
    )
  temporary_password = _generate_temporary_password()
  user.password_hash = pwd_context.hash(temporary_password)
  user.must_change_password = True
  await _revoke_all_refresh_tokens(session, user.id)
  await session.commit()
  return AdminPasswordResetOut(
      user_id=user.id,
      username=user.username,
      temporary_password=temporary_password,
  )


@router.post("/refresh", response_model=TokenOut)
async def refresh_tokens(
    request: Request,
    body: RefreshRequest | None = None,
    session: AsyncSession = Depends(get_session),
):
  refresh_token = (
      body.refresh_token if body is not None else None
  ) or request.cookies.get(REFRESH_TOKEN_COOKIE)
  if not refresh_token:
    raise http_problem(
        status_code=401,
        detail="missing refresh token",
        code="auth_invalid_refresh_token",
    )
  token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
  token = await session.get(RefreshToken, token_hash)
  if (
      not token
      or token.revoked
      or _as_utc(token.expires_at) < _utcnow()
  ):
    raise http_problem(
        status_code=401,
        detail="invalid refresh token",
        code="auth_invalid_refresh_token",
    )
  latest = await _latest_active_refresh_token(session, token.user_id)
  if latest and latest.token_hash != token_hash:
    raise http_problem(
        status_code=401,
        detail="invalid refresh token",
        code="auth_invalid_refresh_token",
    )
  user = await session.get(User, token.user_id)
  if not user:
    raise http_problem(
        status_code=401,
        detail="user not found",
        code="auth_user_not_found",
    )
  now = _utcnow()
  token.last_used_at = now
  token.revoked = True
  access_token, refresh_token, csrf_token = await create_token(
      user, session, family_id=token.family_id
  )
  await session.commit()
  payload = TokenOut(
      access_token=access_token,
      refresh_token=refresh_token,
      csrf_token=csrf_token,
      must_change_password=user.must_change_password,
      session_hint=_build_session_hint(user),
  )
  response = JSONResponse(content=payload.model_dump(by_alias=True))
  _attach_auth_cookies(
      response,
      user,
      access_token,
      refresh_token,
      csrf_token,
      payload.session_hint,
  )
  return response


@router.post("/revoke")
async def revoke_token(
    request: Request,
    body: RefreshRequest | None = None,
    session: AsyncSession = Depends(get_session),
):
  refresh_token = (
      body.refresh_token if body is not None else None
  ) or request.cookies.get(REFRESH_TOKEN_COOKIE)
  response = JSONResponse({"status": "ok"})
  if not refresh_token:
    _clear_auth_cookies(response)
    return response

  token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
  token = await session.get(RefreshToken, token_hash)
  if token:
    await _revoke_all_refresh_tokens(session, token.user_id)
    await session.commit()
  _clear_auth_cookies(response)
  return response
