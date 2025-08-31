import os
from fastapi import Header, HTTPException


async def require_admin(x_admin_secret: str | None = Header(None)) -> None:
    expected = os.getenv("ADMIN_SECRET")
    if not expected or x_admin_secret != expected:
        raise HTTPException(status_code=401, detail="unauthorized")

