from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import Match, MatchParticipant, ScoreEvent, RuleSet
from ..models import generate_ulid
from ..schemas import MatchCreate, MatchRead, MatchParticipantCreate, ScoreEventCreate
from ..schemas import Event
from ..scoring import get_engine

router = APIRouter(prefix="/api/v0/matches", tags=["matches"])


class ConnectionManager:
    def __init__(self):
        self.active: dict[str, list[WebSocket]] = {}

    async def connect(self, match_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active.setdefault(match_id, []).append(websocket)

    def disconnect(self, match_id: str, websocket: WebSocket):
        if match_id in self.active:
            self.active[match_id].remove(websocket)

    async def broadcast(self, match_id: str, message: dict):
        for ws in self.active.get(match_id, []):
            await ws.send_json(message)


manager = ConnectionManager()


async def _compute_summary(match: Match, session: AsyncSession) -> dict:
    engine = get_engine(match.sport_id)
    ruleset = None
    if match.ruleset_id:
        ruleset = await session.get(RuleSet, match.ruleset_id)
    config = ruleset.config if ruleset else {}
    state = engine.init_state(config)
    result = await session.execute(select(ScoreEvent).where(ScoreEvent.match_id == match.id).order_by(ScoreEvent.created_at))
    for ev in result.scalars().all():
        evt = Event(type=ev.type, **ev.payload)
        state = engine.apply(evt, state)
    return engine.summary(state)


@router.post("", response_model=MatchRead)
async def create_match(match: MatchCreate, session: AsyncSession = Depends(get_session)):
    db_match = Match(id=generate_ulid(), sport_id=match.sport_id, ruleset_id=match.ruleset_id, metadata=match.metadata)
    session.add(db_match)
    for p in match.participants:
        mp = MatchParticipant(id=generate_ulid(), match_id=db_match.id, side=p.side, player_ids=p.player_ids)
        session.add(mp)
    await session.commit()
    await session.refresh(db_match)
    summary = await _compute_summary(db_match, session)
    participants = [MatchParticipantCreate(side=mp.side, player_ids=mp.player_ids) for mp in db_match.participants]
    return MatchRead(id=db_match.id, sport_id=db_match.sport_id, ruleset_id=db_match.ruleset_id, participants=participants, metadata=db_match.metadata, summary=summary)


@router.get("/{match_id}", response_model=MatchRead)
async def get_match(match_id: str, session: AsyncSession = Depends(get_session)):
    match = await session.get(Match, match_id)
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    summary = await _compute_summary(match, session)
    participants = [MatchParticipantCreate(side=mp.side, player_ids=mp.player_ids) for mp in match.participants]
    return MatchRead(id=match.id, sport_id=match.sport_id, ruleset_id=match.ruleset_id, participants=participants, metadata=match.metadata, summary=summary)


@router.post("/{match_id}/events")
async def add_event(match_id: str, body: ScoreEventCreate, session: AsyncSession = Depends(get_session)):
    match = await session.get(Match, match_id)
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    event = body.event
    db_event = ScoreEvent(id=generate_ulid(), match_id=match_id, type=event.type, payload=event.model_dump(exclude={"type"}))
    session.add(db_event)
    await session.commit()
    summary = await _compute_summary(match, session)
    await manager.broadcast(match_id, {"summary": summary})
    return {"summary": summary}


@router.websocket("/{match_id}/stream")
async def stream(match_id: str, websocket: WebSocket):
    await manager.connect(match_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(match_id, websocket)
