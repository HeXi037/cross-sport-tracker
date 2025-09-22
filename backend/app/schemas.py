from typing import Any, Dict, List, Literal, Optional, Tuple
from collections.abc import Sequence
from datetime import datetime, timezone
import re
from pydantic import BaseModel, Field, model_validator, field_validator

from .location_utils import normalize_location_fields

PASSWORD_REGEX = re.compile(r"^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$")

class SportOut(BaseModel):
    id: str
    name: str

class RuleSetOut(BaseModel):
    id: str
    sport_id: str
    name: str
    config: dict

class BadgeCreate(BaseModel):
    name: str
    icon: Optional[str] = None

class BadgeOut(BaseModel):
    id: str
    name: str
    icon: Optional[str] = None

class PlayerCreate(BaseModel):
    name: str = Field(
        ..., min_length=1, max_length=50, pattern=r"^[A-Za-z0-9 '-]+$"
    )
    club_id: Optional[str] = None
    photo_url: Optional[str] = None
    location: Optional[str] = None
    ranking: Optional[int] = None
    country_code: Optional[str] = None
    region_code: Optional[str] = None

    @model_validator(mode="after")
    def _normalize_location(cls, model: "PlayerCreate") -> "PlayerCreate":
        (
            model.location,
            model.country_code,
            model.region_code,
        ) = normalize_location_fields(
            model.location,
            model.country_code,
            model.region_code,
            raise_on_invalid=True,
        )
        return model

class PlayerOut(BaseModel):
    id: str
    name: str
    club_id: Optional[str] = None
    photo_url: Optional[str] = None
    location: Optional[str] = None
    ranking: Optional[int] = None
    country_code: Optional[str] = None
    region_code: Optional[str] = None
    metrics: Optional[Dict[str, Dict[str, int]]] = None
    milestones: Optional[Dict[str, List[str]]] = None
    badges: List[BadgeOut] = Field(default_factory=list)

    @model_validator(mode="after")
    def _sync_location_fields(cls, model: "PlayerOut") -> "PlayerOut":
        (
            model.location,
            model.country_code,
            model.region_code,
        ) = normalize_location_fields(
            model.location,
            model.country_code,
            model.region_code,
        )
        return model

class PlayerNameOut(BaseModel):
    id: str
    name: str
    photo_url: Optional[str] = None

class PlayerListOut(BaseModel):
    players: List[PlayerOut]
    total: int
    limit: int
    offset: int

class LeaderboardEntryOut(BaseModel):
    rank: int
    playerId: str
    playerName: str
    rating: float
    rankChange: int
    sets: int
    setsWon: int
    setsLost: int
    setDiff: int

class LeaderboardOut(BaseModel):
    sport: str
    leaders: List[LeaderboardEntryOut]
    total: int
    limit: int
    offset: int

class Participant(BaseModel):
    side: Literal["A", "B", "C", "D", "E", "F"]
    playerIds: List[str]


def _normalize_participants_payload(
    data: Any, player_field: Literal["playerIds", "playerNames"]
) -> Any:
    if not isinstance(data, dict) or "participants" not in data:
        return data

    raw_parts = data["participants"]
    if raw_parts is None:
        return data

    if not isinstance(raw_parts, list):
        raw_parts = list(raw_parts)

    seen_sides: set[str] = set()
    normalized_parts: list[dict[str, Any]] = []

    for part in raw_parts:
        if isinstance(part, BaseModel):
            part_data = part.model_dump()
        elif isinstance(part, dict):
            part_data = dict(part)
        else:
            raise TypeError(
                "participants must be provided as mappings or Pydantic models"
            )

        side = part_data.get("side")
        normalized_side = side.upper() if isinstance(side, str) else side
        side_key = normalized_side if isinstance(normalized_side, str) else str(normalized_side)

        if side_key in seen_sides:
            raise ValueError("participants must have unique sides")
        seen_sides.add(side_key)

        players = part_data.get(player_field)
        if isinstance(players, list):
            player_list = players
        elif isinstance(players, Sequence) and not isinstance(players, (str, bytes)):
            player_list = list(players)
        elif players is None:
            player_list = []
        else:
            player_list = players  # allow Pydantic to flag incorrect types

        if not player_list:
            raise ValueError("participants must include at least one player")

        part_data["side"] = normalized_side
        part_data[player_field] = player_list
        normalized_parts.append(part_data)

    return {**data, "participants": normalized_parts}


class MatchCreate(BaseModel):
    sport: str
    rulesetId: Optional[str] = None
    participants: List[Participant]
    bestOf: Optional[int] = None
    playedAt: Optional[datetime] = None
    location: Optional[str] = None
    score: Optional[List[int]] = None
    sets: Optional[List[List[int]]] = None

    @field_validator("playedAt")
    def _normalize_played_at(cls, v: datetime | None) -> datetime | None:
        if v and v.tzinfo:
            return v.astimezone(timezone.utc).replace(tzinfo=None)
        return v

    @model_validator(mode="before")
    def _validate_participants(cls, data: Any) -> Any:
        return _normalize_participants_payload(data, "playerIds")

class ParticipantByName(BaseModel):
    side: Literal["A", "B", "C", "D", "E", "F"]
    playerNames: List[str]

class MatchCreateByName(BaseModel):
    sport: str
    rulesetId: Optional[str] = None
    participants: List[ParticipantByName]
    bestOf: Optional[int] = None
    playedAt: Optional[datetime] = None
    location: Optional[str] = None
    sets: Optional[List[Tuple[int, int]]] = None

    @field_validator("playedAt")
    def _normalize_played_at(cls, v: datetime | None) -> datetime | None:
        if v and v.tzinfo:
            return v.astimezone(timezone.utc).replace(tzinfo=None)
        return v

    @model_validator(mode="before")
    def _validate_participants(cls, data: Any) -> Any:
        return _normalize_participants_payload(data, "playerNames")

class SetScore(BaseModel):
    A: int
    B: int

    @model_validator(mode="before")
    def _coerce(cls, value: Any) -> Dict[str, int]:
        """Allow incoming set scores to be provided as tuples or objects."""
        if isinstance(value, dict):
            return value
        if isinstance(value, (list, tuple)) and len(value) == 2:
            return {"A": value[0], "B": value[1]}
        if hasattr(value, "A") or hasattr(value, "B"):
            return {"A": getattr(value, "A", None), "B": getattr(value, "B", None)}
        raise TypeError("Set scores must be a mapping or 2-item tuple/list.")


class SetsIn(BaseModel):
    sets: List[SetScore]

class EventIn(BaseModel):
    type: Literal["POINT", "ROLL", "UNDO", "HOLE"]
    by: Optional[Literal["A", "B", "C", "D", "E", "F"]] = None
    pins: Optional[int] = None
    side: Optional[Literal["A", "B", "C", "D", "E", "F"]] = None
    hole: Optional[int] = None
    strokes: Optional[int] = None

    @model_validator(mode="after")
    def _validate_hole(cls, values):
        if values.type == "HOLE":
            missing = [
                field
                for field in ("side", "hole", "strokes")
                if getattr(values, field) is None
            ]
            if missing:
                raise ValueError(
                    "side, hole, and strokes are required for HOLE events"
                )
        return values
# (remaining schema definitions unchanged)
class UserCreate(BaseModel):
    """Schema for user signup requests."""
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=12)
    is_admin: bool = False

    @field_validator("password")
    def _check_password_complexity(cls, v: str) -> str:
        if not PASSWORD_REGEX.match(v):
            raise ValueError(
                "Password must contain letters, numbers, and symbols"
            )
        return v

class UserLogin(BaseModel):
    """Schema for user login requests."""
    username: str
    password: str

class TokenOut(BaseModel):
    """Returned on successful authentication."""
    access_token: str
    refresh_token: str


class UserOut(BaseModel):
    """Public user information."""
    id: str
    username: str
    is_admin: bool
    photo_url: Optional[str] = None


class UserUpdate(BaseModel):
    """Payload for updating the current user."""
    username: Optional[str] = Field(None, min_length=3, max_length=50)
    password: Optional[str] = Field(None, min_length=12)

    @field_validator("password")
    def _check_password_complexity(cls, v: str | None) -> str | None:
        if v is None:
            return v
        if not PASSWORD_REGEX.match(v):
            raise ValueError("Password must contain letters, numbers, and symbols")
        return v


class RefreshRequest(BaseModel):
    """Request body for refreshing or revoking tokens."""
    refresh_token: str

class CommentCreate(BaseModel):
    """Schema for creating a comment on a player."""
    content: str = Field(..., min_length=1, max_length=500)

class CommentOut(BaseModel):
    """Schema representing a comment returned to clients."""
    id: str
    playerId: str
    userId: str
    username: str
    content: str
    createdAt: datetime


class CommentListOut(BaseModel):
    """Paginated list of comments returned from the comments endpoint."""

    items: List[CommentOut]
    total: int
    limit: int
    offset: int

class VersusRecord(BaseModel):
    """Win/loss record versus or with another player."""
    playerId: str
    playerName: str
    wins: int
    losses: int
    winPct: float

class SportFormatStats(BaseModel):
    """Aggregated stats for a particular sport and team size."""
    sport: str
    format: str
    wins: int
    losses: int
    winPct: float

class StreakSummary(BaseModel):
    """Represents winning and losing streak information."""
    current: int
    longestWin: int
    longestLoss: int

class PlayerStatsOut(BaseModel):
    """Statistics summary returned by the player stats endpoint."""
    playerId: str
    bestAgainst: Optional[VersusRecord] = None
    worstAgainst: Optional[VersusRecord] = None
    bestWith: Optional[VersusRecord] = None
    worstWith: Optional[VersusRecord] = None
    rollingWinPct: List[float] = Field(default_factory=list)
    sportFormatStats: List[SportFormatStats] = Field(default_factory=list)
    withRecords: List[VersusRecord] = Field(default_factory=list)
    streaks: Optional[StreakSummary] = None


class MatchIdOut(BaseModel):
    """Schema returned after creating a match."""

    id: str


class MatchSummaryOut(BaseModel):
    """Lightweight representation of a match used in listings."""

    id: str
    sport: str
    bestOf: Optional[int] = None
    playedAt: Optional[datetime] = None
    location: Optional[str] = None


class ParticipantOut(BaseModel):
    """Participant information for a match."""

    id: str
    side: Literal["A", "B", "C", "D", "E", "F"]
    playerIds: List[str]


class ScoreEventOut(BaseModel):
    """Represents an individual scoring event within a match."""

    id: str
    type: str
    payload: Dict[str, Any]
    createdAt: datetime


class MatchOut(BaseModel):
    """Detailed match information returned by the API."""

    id: str
    sport: str
    rulesetId: Optional[str] = None
    bestOf: Optional[int] = None
    playedAt: Optional[datetime] = None
    location: Optional[str] = None
    participants: List[ParticipantOut] = Field(default_factory=list)
    events: List[ScoreEventOut] = Field(default_factory=list)
    summary: Optional[Dict[str, Any]] = None


class TournamentCreate(BaseModel):
    """Schema for creating a tournament."""

    sport: str
    name: str
    clubId: Optional[str] = None


class TournamentOut(BaseModel):
    """Returned representation of a tournament."""

    id: str
    sport: str
    name: str
    clubId: Optional[str] = None


class StageCreate(BaseModel):
    """Schema for creating a tournament stage."""

    type: str


class StageOut(BaseModel):
    """Returned representation of a tournament stage."""

    id: str
    tournamentId: str
    type: str
