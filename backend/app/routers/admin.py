from fastapi import Depends, HTTPException

from ..models import User
from .auth import get_current_user


async def require_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="forbidden")
    return user
