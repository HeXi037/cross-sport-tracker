from typing import List, Literal, Optional, Tuple
from datetime import datetime
from pydantic import BaseModel, Field, model_validator


# Basic DTOs
class SportOut(BaseModel):
    id: str
    name: str


class RuleSetOut(BaseModel):
    id: str
    sport_id: str
    name: str
    config: dict


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


class PlayerNameOut(BaseModel):
    id: str
    name: str


class PlayerListOut(BaseModel):
    players: List[PlayerOut]
    total: int
    limit: int
    offset: int


class PlayerNameOut(BaseModel):
    id: str
    name: str


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
    side: Literal["A", "B"]
    playerIds: List[str]


class MatchCreate(BaseModel):
    sport: str
    rulesetId: Optional[str] = None
    participants: List[Participant]
    bestOf: Optional[int] = None
    playedAt: Optional[datetime] = None
    location: Optional[str] = None


class ParticipantByName(BaseModel):
    side: Literal["A", "B"]
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
    by: Optional[Literal["A", "B"]] = None
    pins: Optional[int] = None
    side: Optional[Literal["A", "B"]] = None
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


# Response models
class ParticipantOut(BaseModel):
    id: str
    side: Literal["A", "B"]
    playerIds: List[str]


class ScoreEventOut(BaseModel):
    id: str
    type: str
    payload: dict
    createdAt: datetime


class MatchIdOut(BaseModel):
    id: str


class MatchSummaryOut(BaseModel):
    id: str
    sport: str
    bestOf: Optional[int] = None
    playedAt: Optional[datetime] = None
    location: Optional[str] = None


class MatchOut(MatchSummaryOut):
    rulesetId: Optional[str] = None
    participants: List[ParticipantOut]
    events: List[ScoreEventOut]
    summary: Optional[dict] = None


class VersusRecord(BaseModel):
    playerId: str
    playerName: str
    wins: int
    losses: int
    winPct: float


class SportFormatStats(BaseModel):
    sport: str
    format: str
    wins: int
    losses: int
    winPct: float


class StreakSummary(BaseModel):
    current: int
    longestWin: int
    longestLoss: int

    @property
    def description(self) -> str:
        if self.current > 0:
            return f"Won {self.current} in a row"
        if self.current < 0:
            return f"Lost {abs(self.current)} in a row"
        return "No games played"


class PlayerStatsOut(BaseModel):
    playerId: str
    bestAgainst: Optional[VersusRecord] = None
    worstAgainst: Optional[VersusRecord] = None
    bestWith: Optional[VersusRecord] = None
    worstWith: Optional[VersusRecord] = None
    rollingWinPct: Optional[list[float]] = None
    sportFormatStats: list[SportFormatStats] = []
    streaks: Optional[StreakSummary] = None


class UserCreate(BaseModel):
    username: str
    password: str
    is_admin: bool = False


class UserLogin(BaseModel):
    username: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TournamentCreate(BaseModel):
    sport: str
    name: str
    clubId: Optional[str] = None


class TournamentOut(BaseModel):
    id: str
    sport: str
    name: str
    clubId: Optional[str] = None


class StageCreate(BaseModel):
    type: Literal["round_robin", "single_elim"]


class StageOut(BaseModel):
    id: str
    tournamentId: str
    type: str


class CommentCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=500)


class CommentOut(BaseModel):
    id: str
    playerId: str
    userId: str
    username: str
    content: str
    createdAt: datetime
