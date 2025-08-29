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
    createMissing: bool = False  # opt-in auto-create for unknown player names


class SetsIn(BaseModel):
    # API expects 2-item arrays (tuples) per set: [[A,B], ...]
    sets: List[Tuple[int, int]]


class EventIn(BaseModel):
    type: Literal["POINT", "ROLL", "UNDO"]
    by: Optional[Literal["A", "B"]] = None
    pins: Optional[int] = None
