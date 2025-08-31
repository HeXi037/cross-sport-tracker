from typing import List, Literal, Optional, Tuple
from datetime import datetime
from pydantic import BaseModel

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
    name: str
    club_id: Optional[str] = None

class PlayerOut(BaseModel):
    id: str
    name: str
    club_id: Optional[str] = None


class PlayerListOut(BaseModel):
    players: List[PlayerOut]
    total: int
    limit: int
    offset: int


class LeaderboardEntryOut(BaseModel):
    playerId: str
    playerName: str
    rating: float


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
    type: Literal["POINT", "ROLL", "UNDO"]
    by: Optional[Literal["A", "B"]] = None
    pins: Optional[int] = None


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


class PlayerStatsOut(BaseModel):
    playerId: str
    bestAgainst: Optional[VersusRecord] = None
    worstAgainst: Optional[VersusRecord] = None
    bestWith: Optional[VersusRecord] = None
    worstWith: Optional[VersusRecord] = None

