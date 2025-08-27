from typing import List, Literal, Optional
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

class EventIn(BaseModel):
    type: Literal["POINT", "ROLL", "UNDO"]
    by: Optional[Literal["A", "B"]] = None
    pins: Optional[int] = None
