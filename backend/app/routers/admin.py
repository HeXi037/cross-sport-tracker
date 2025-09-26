from fastapi import Depends

from ..models import User
from ..exceptions import http_problem
from .auth import get_current_user


async def require_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise http_problem(
            status_code=403,
            detail="forbidden",
            code="admin_forbidden",
        )
    return user
