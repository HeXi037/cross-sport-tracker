from typing import List, Optional, Literal
from pydantic import BaseModel


class SportRead(BaseModel):
    id: str
    name: str

    class Config:
        orm_mode = True


class RuleSetRead(BaseModel):
    id: str
    sport_id: str
    name: str
    config: dict

    class Config:
        orm_mode = True


class PlayerCreate(BaseModel):
    name: str


class PlayerRead(BaseModel):
    id: str
    name: str

    class Config:
        orm_mode = True


class MatchParticipantCreate(BaseModel):
    side: Literal["A", "B"]
    player_ids: List[str]


class MatchCreate(BaseModel):
    sport_id: str
    ruleset_id: Optional[str] = None
    participants: List[MatchParticipantCreate]
    metadata: Optional[dict] = None


class MatchRead(BaseModel):
    id: str
    sport_id: str
    ruleset_id: Optional[str] = None
    participants: List[MatchParticipantCreate]
    metadata: Optional[dict] = None
    summary: dict


class Event(BaseModel):
    type: Literal["POINT", "ROLL", "UNDO"]
    by: Optional[Literal["A", "B"]] = None
    pins: Optional[int] = None


class ScoreEventCreate(BaseModel):
    event: Event


class LeaderboardEntry(BaseModel):
    player_id: str
    player_name: str
    value: float
