from typing import Any, Dict, List, Literal, Optional, Tuple
from datetime import datetime
import re
from pydantic import BaseModel, Field, model_validator, field_validator

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

class PlayerOut(BaseModel):
    id: str
    name: str
    club_id: Optional[str] = None
    photo_url: Optional[str] = None
    location: Optional[str] = None
    ranking: Optional[int] = None
    metrics: Optional[Dict[str, Dict[str, int]]] = None
    milestones: Optional[Dict[str, List[str]]] = None
    badges: List[BadgeOut] = []

class PlayerNameOut(BaseModel):
    id: str
    name: str
    photo_url: Optional[str] = None

class PlayerListOut(BaseModel):
    players: List[PlayerOut]
    total: int
    limit: int
    offset: int

class PlayerNameOut(BaseModel):
    id: str
    name: str
    photo_url: Optional[str] = None

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

class MatchCreate(BaseModel):
    sport: str
    rulesetId: Optional[str] = None
    participants: List[Participant]
    bestOf: Optional[int] = None
    playedAt: Optional[datetime] = None
    location: Optional[str] = None
    score: Optional[List[int]] = None

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

class SetsIn(BaseModel):
    sets: List[Tuple[int, int]]

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
    password: str = Field(..., min_length=8)
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
    rollingWinPct: List[float] = []
    sportFormatStats: List[SportFormatStats] = []
    withRecords: List[VersusRecord] = []
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
    participants: List[ParticipantOut] = []
    events: List[ScoreEventOut] = []
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
