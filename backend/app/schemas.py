from typing import Any, Dict, List, Literal, Optional, Tuple
from collections.abc import Sequence
from datetime import datetime
from urllib.parse import urlparse
from pydantic import BaseModel, Field, model_validator, field_validator, ConfigDict

from .location_utils import normalize_location_fields, continent_for_country
from .time_utils import require_utc

MIN_PASSWORD_LENGTH = 8

class SportOut(BaseModel):
    id: str
    name: str

class RuleSetOut(BaseModel):
    id: str
    sport_id: str
    name: str
    config: dict


class ClubOut(BaseModel):
    id: str
    name: str


class ClubCreate(BaseModel):
    id: str = Field(..., min_length=1, max_length=100)
    name: str = Field(..., min_length=1, max_length=200)

    model_config = ConfigDict(extra="forbid")

    @field_validator("id", mode="before")
    @classmethod
    def _validate_id(cls, value: str) -> str:
        if not isinstance(value, str):
            raise TypeError("id must be a string")
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("id must not be empty")
        if any(ch.isspace() for ch in trimmed):
            raise ValueError("id must not contain whitespace")
        return trimmed

    @field_validator("name", mode="before")
    @classmethod
    def _validate_name(cls, value: str) -> str:
        if not isinstance(value, str):
            raise TypeError("name must be a string")
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("name must not be empty")
        return trimmed

class BadgeCreate(BaseModel):
    name: str
    icon: Optional[str] = None

class BadgeUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None

class BadgeOut(BaseModel):
    id: str
    name: str
    icon: Optional[str] = None


class PlayerSocialLinkBase(BaseModel):
    label: str = Field(..., min_length=1, max_length=100)
    url: str = Field(..., min_length=1, max_length=2000)

    @field_validator("label", mode="before")
    @classmethod
    def _normalize_label(cls, value: str) -> str:
        if not isinstance(value, str):
            raise TypeError("label must be a string")
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("label must not be empty")
        return trimmed

    @field_validator("url", mode="before")
    @classmethod
    def _validate_url(cls, value: str) -> str:
        if not isinstance(value, str):
            raise TypeError("url must be a string")
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("url must not be empty")
        parsed = urlparse(trimmed)
        scheme = parsed.scheme.lower()
        if scheme not in {"http", "https"}:
            raise ValueError("url must start with http:// or https://")
        if not parsed.netloc:
            raise ValueError("url must include a host")
        return trimmed


class PlayerSocialLinkCreate(PlayerSocialLinkBase):
    pass


class PlayerSocialLinkUpdate(BaseModel):
    label: Optional[str] = Field(default=None, min_length=1, max_length=100)
    url: Optional[str] = Field(default=None, min_length=1, max_length=2000)

    @field_validator("label", mode="before")
    @classmethod
    def _normalize_label(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        if not isinstance(value, str):
            raise TypeError("label must be a string")
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("label must not be empty")
        return trimmed

    @field_validator("url", mode="before")
    @classmethod
    def _validate_url(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        if not isinstance(value, str):
            raise TypeError("url must be a string")
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("url must not be empty")
        parsed = urlparse(trimmed)
        scheme = parsed.scheme.lower()
        if scheme not in {"http", "https"}:
            raise ValueError("url must start with http:// or https://")
        if not parsed.netloc:
            raise ValueError("url must include a host")
        return trimmed

    @model_validator(mode="after")
    def _ensure_fields(self) -> "PlayerSocialLinkUpdate":
        if not self.model_fields_set:
            raise ValueError("at least one field must be provided")
        if all(getattr(self, field) is None for field in ("label", "url")):
            raise ValueError("at least one field must be provided")
        return self


class PlayerSocialLinkOut(PlayerSocialLinkBase):
    id: str
    created_at: datetime

class PlayerCreate(BaseModel):
    name: str = Field(
        ..., min_length=1, max_length=50, pattern=r"^[A-Za-z0-9 '-]+$"
    )
    club_id: Optional[str] = None
    photo_url: Optional[str] = None
    bio: Optional[str] = Field(default=None, max_length=2000)
    location: Optional[str] = None
    ranking: Optional[int] = None
    country_code: Optional[str] = None
    region_code: Optional[str] = None

    @field_validator("bio", mode="before")
    @classmethod
    def _normalize_bio(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        if not isinstance(value, str):
            raise TypeError("bio must be a string")
        trimmed = value.strip()
        return trimmed or None

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
        if model.country_code:
            model.location = model.country_code
            model.region_code = continent_for_country(model.country_code)
        else:
            model.location = None
            model.region_code = None
        return model


class PlayerLocationUpdate(BaseModel):
    location: Optional[str] = None
    country_code: Optional[str] = None
    region_code: Optional[str] = None
    club_id: Optional[str] = None
    bio: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("club_id", mode="after")
    @classmethod
    def _normalize_club_id(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        if isinstance(value, str):
            trimmed = value.strip()
            return trimmed or None
        raise TypeError("club_id must be a string")

    @field_validator("bio", mode="before")
    @classmethod
    def _normalize_bio(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        if not isinstance(value, str):
            raise TypeError("bio must be a string")
        trimmed = value.strip()
        return trimmed or None

    @model_validator(mode="after")
    def _normalize_location(
        cls, model: "PlayerLocationUpdate"
    ) -> "PlayerLocationUpdate":
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
        if model.country_code:
            model.location = model.country_code
            model.region_code = continent_for_country(model.country_code)
        else:
            model.location = None
            model.region_code = None
        return model


class PlayerOut(BaseModel):
    id: str
    name: str
    club_id: Optional[str] = None
    photo_url: Optional[str] = None
    bio: Optional[str] = None
    location: Optional[str] = None
    ranking: Optional[int] = None
    country_code: Optional[str] = None
    region_code: Optional[str] = None
    hidden: bool = False
    metrics: Optional[Dict[str, Dict[str, int]]] = None
    milestones: Optional[Dict[str, List[str]]] = None
    badges: List[BadgeOut] = Field(default_factory=list)
    social_links: List[PlayerSocialLinkOut] = Field(default_factory=list)
    match_summary: Optional["MatchSummary"] = None

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
        if model.country_code:
            model.location = model.country_code
            model.region_code = continent_for_country(model.country_code)
        else:
            model.location = None
            model.region_code = None
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


class PlayerVisibilityUpdate(BaseModel):
    hidden: bool

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
    details: Optional[Dict[str, Any]] = None
    isFriendly: bool = False

    @field_validator("playedAt")
    def _normalize_played_at(cls, v: datetime | None) -> datetime | None:
        return require_utc(v, field_name="playedAt")

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
    isFriendly: bool = False

    @field_validator("playedAt")
    def _normalize_played_at(cls, v: datetime | None) -> datetime | None:
        return require_utc(v, field_name="playedAt")

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
def _ensure_password_complexity(value: str) -> str:
    if len(value) < MIN_PASSWORD_LENGTH:
        raise ValueError(
            f"Password must be at least {MIN_PASSWORD_LENGTH} characters long"
        )
    if not value.strip():
        raise ValueError("Password must include at least one non-space character")
    return value


class UserCreate(BaseModel):
    """Schema for user signup requests."""
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=MIN_PASSWORD_LENGTH)
    is_admin: bool = False

    @field_validator("password")
    def _check_password_complexity(cls, v: str) -> str:
        return _ensure_password_complexity(v)

class UserLogin(BaseModel):
    """Schema for user login requests."""
    username: str
    password: str

class TokenOut(BaseModel):
    """Returned on successful authentication."""
    access_token: str
    refresh_token: str
    csrf_token: str


class UsernameAvailabilityResponse(BaseModel):
    """Response payload for username availability checks."""

    available: bool


class UserOut(BaseModel):
    """Public user information."""
    id: str
    username: str
    is_admin: bool
    photo_url: Optional[str] = None


class UserUpdate(BaseModel):
    """Payload for updating the current user."""
    username: Optional[str] = Field(None, min_length=3, max_length=50)
    password: Optional[str] = Field(None, min_length=MIN_PASSWORD_LENGTH)

    @field_validator("password")
    def _check_password_complexity(cls, v: str | None) -> str | None:
        if v is None:
            return v
        return _ensure_password_complexity(v)


class AdminPasswordResetRequest(BaseModel):
    """Payload for administrators to reset a user's password."""

    user_id: Optional[str] = Field(default=None, alias="userId")
    username: Optional[str] = Field(default=None, min_length=1)

    model_config = ConfigDict(populate_by_name=True)

    @model_validator(mode="after")
    def _ensure_identifier(self) -> "AdminPasswordResetRequest":
        if not self.user_id and not self.username:
            raise ValueError("user_id or username is required")
        if self.username is not None:
            trimmed = self.username.strip().lower()
            if not trimmed:
                raise ValueError("username must not be empty")
            self.username = trimmed
        return self


class AdminPasswordResetOut(BaseModel):
    """Response when an administrator resets a user's password."""

    user_id: str = Field(alias="userId")
    username: str
    temporary_password: str = Field(alias="temporaryPassword")

    model_config = ConfigDict(populate_by_name=True)


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


class PushSubscriptionKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscriptionCreate(BaseModel):
    endpoint: str
    keys: PushSubscriptionKeys
    content_encoding: str | None = Field(default=None, alias="contentEncoding")

    model_config = ConfigDict(populate_by_name=True)


class PushSubscriptionOut(BaseModel):
    id: str
    endpoint: str
    createdAt: datetime


class NotificationPreferenceOut(BaseModel):
    notifyOnProfileComments: bool
    notifyOnMatchResults: bool
    pushEnabled: bool
    subscriptions: List[PushSubscriptionOut] = Field(default_factory=list)


class NotificationPreferenceUpdate(BaseModel):
    notify_on_profile_comments: bool | None = Field(
        default=None, alias="notifyOnProfileComments"
    )
    notify_on_match_results: bool | None = Field(
        default=None, alias="notifyOnMatchResults"
    )
    push_enabled: bool | None = Field(default=None, alias="pushEnabled")

    model_config = ConfigDict(populate_by_name=True)


class NotificationOut(BaseModel):
    id: str
    type: str
    payload: Dict[str, Any]
    createdAt: datetime
    readAt: Optional[datetime] = None


class NotificationListOut(BaseModel):
    items: List[NotificationOut]
    unreadCount: int

class VersusRecord(BaseModel):
    """Win/loss record versus or with another player."""
    playerId: str
    playerName: str
    wins: int
    losses: int
    winPct: float
    total: Optional[int] = None
    chemistry: Optional[float] = None

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


class RatingSystemSnapshot(BaseModel):
    """Rating information for a specific rating system."""

    value: Optional[float] = None
    delta30: float = 0.0
    sparkline: List[float] = Field(default_factory=list)
    deviation: Optional[float] = None
    lastUpdated: Optional[datetime] = None


class SportRatingSummary(BaseModel):
    """Ratings for a player within a given sport."""

    sport: str
    elo: Optional[RatingSystemSnapshot] = None
    glicko: Optional[RatingSystemSnapshot] = None


class MatchSummary(BaseModel):
    """Aggregate match record for a player."""

    total: int = 0
    wins: int = 0
    losses: int = 0
    draws: int = 0
    winPct: float = 0.0


class SetSummary(BaseModel):
    """Aggregate set performance for a player."""

    won: int = 0
    lost: int = 0
    differential: int = 0


class RecentFormSummary(BaseModel):
    """Recent form indicators for a player."""

    lastFive: List[str] = Field(default_factory=list)
    currentStreak: str = ""


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
    matchSummary: MatchSummary = Field(default_factory=MatchSummary)
    setSummary: SetSummary = Field(default_factory=SetSummary)
    recentForm: RecentFormSummary = Field(default_factory=RecentFormSummary)
    topPartners: List[VersusRecord] = Field(default_factory=list)
    headToHeadRecords: List[VersusRecord] = Field(default_factory=list)
    ratings: List[SportRatingSummary] = Field(default_factory=list)


class MatchIdOut(BaseModel):
    """Schema returned after creating a match."""

    id: str


class MatchSummaryOut(BaseModel):
    """Lightweight representation of a match used in listings."""

    id: str
    sport: str
    stageId: Optional[str] = None
    bestOf: Optional[int] = None
    playedAt: Optional[datetime] = None
    location: Optional[str] = None
    isFriendly: bool
    participants: List["MatchSummaryParticipantOut"] = Field(default_factory=list)
    summary: Optional[Dict[str, Any]] = None


class MatchSummaryPageOut(BaseModel):
    """Paginated collection of matches with navigation metadata."""

    items: List[MatchSummaryOut] = Field(default_factory=list)
    limit: int
    offset: int
    hasMore: bool = False
    nextOffset: Optional[int] = None


class ParticipantOut(BaseModel):
    """Participant information for a match."""

    id: str
    side: Literal["A", "B", "C", "D", "E", "F"]
    playerIds: List[str]


class MatchSummaryParticipantOut(ParticipantOut):
    """Participant information included in match summaries."""

    players: List[PlayerNameOut] = Field(default_factory=list)


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
    stageId: Optional[str] = None
    rulesetId: Optional[str] = None
    bestOf: Optional[int] = None
    playedAt: Optional[datetime] = None
    location: Optional[str] = None
    isFriendly: bool
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
    createdByUserId: Optional[str] = None


class StageCreate(BaseModel):
    """Schema for creating a tournament stage."""

    type: str
    config: Optional[Dict[str, Any]] = None


class StageOut(BaseModel):
    """Returned representation of a tournament stage."""

    id: str
    tournamentId: str
    type: str
    config: Optional[Dict[str, Any]] = None


class StageScheduleRequest(BaseModel):
    """Payload used to generate a schedule for a stage."""

    playerIds: List[str]
    rulesetId: Optional[str] = None
    courtCount: Optional[int] = Field(default=1, ge=1, le=6)


class StageScheduleMatchOut(MatchSummaryOut):
    """Representation of a match created during scheduling."""

    stageId: str  # Narrow ``MatchSummaryOut.stageId`` to be required here.
    rulesetId: Optional[str] = None
    participants: List["MatchSummaryParticipantOut"] = Field(default_factory=list)


class StageScheduleResponse(BaseModel):
    """Response returned when a schedule is created."""

    stageId: str
    matches: List[StageScheduleMatchOut] = Field(default_factory=list)


class StageStandingOut(BaseModel):
    """Aggregate statistics for a player within a stage."""

    playerId: str
    matchesPlayed: int
    wins: int
    losses: int
    draws: int
    pointsScored: int
    pointsAllowed: int
    pointsDiff: int
    setsWon: int
    setsLost: int
    points: int


class StageStandingsOut(BaseModel):
    """Collection of stage standings."""

    stageId: str
    standings: List[StageStandingOut] = Field(default_factory=list)
