from pydantic import BaseModel
from typing import Optional


class ProblemDetail(BaseModel):
    """RFC 7807 compliant error response."""

    type: str = "about:blank"
    title: str
    detail: Optional[str] = None
    status: int
    instance: Optional[str] = None


class DomainException(Exception):
    """Base class for domain-specific exceptions."""

    def __init__(self, status_code: int, title: str, detail: str | None = None, type_: str = "about:blank") -> None:
        self.status_code = status_code
        self.title = title
        self.detail = detail
        self.type = type_


class PlayerAlreadyExists(DomainException):
    def __init__(self, name: str) -> None:
        super().__init__(
            status_code=400,
            title="Player exists",
            detail=f"player name '{name}' already exists",
        )


class PlayerNotFound(DomainException):
    def __init__(self, player_id: str) -> None:
        super().__init__(
            status_code=404,
            title="Player not found",
            detail=f"player '{player_id}' not found",
        )
