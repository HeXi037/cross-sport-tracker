from fastapi import HTTPException
from pydantic import BaseModel
from typing import Optional


class ProblemDetail(BaseModel):
    """RFC 7807 compliant error response."""

    type: str = "about:blank"
    title: str
    detail: Optional[str] = None
    status: int
    instance: Optional[str] = None
    code: str


class DomainException(Exception):
    """Base class for domain-specific exceptions."""

    def __init__(
        self,
        status_code: int,
        title: str,
        *,
        code: str,
        detail: str | None = None,
        type_: str = "about:blank",
    ) -> None:
        self.status_code = status_code
        self.title = title
        self.detail = detail
        self.type = type_
        self.code = code


class PlayerAlreadyExists(DomainException):
    def __init__(self, name: str) -> None:
        super().__init__(
            status_code=400,
            title="Player exists",
            detail=f"player name '{name}' already exists",
            code="player_exists",
        )


class PlayerNotFound(DomainException):
    def __init__(self, player_id: str) -> None:
        super().__init__(
            status_code=404,
            title="Player not found",
            detail=f"player '{player_id}' not found",
            code="player_not_found",
        )


def http_problem(
    status_code: int,
    detail: str,
    code: str,
    *,
    headers: Optional[dict[str, str]] = None,
) -> HTTPException:
    """Create an HTTPException with an attached problem code."""

    exc = HTTPException(status_code=status_code, detail=detail, headers=headers)
    setattr(exc, "code", code)
    return exc
