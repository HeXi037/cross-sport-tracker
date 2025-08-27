from collections import defaultdict
from typing import Dict, Set
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()
_connections: Dict[str, Set[WebSocket]] = defaultdict(set)

async def broadcast(mid: str, message: dict):
    for ws in list(_connections.get(mid, [])):
        try:
            await ws.send_json(message)
        except Exception:
            _connections[mid].discard(ws)

@router.websocket("/matches/{mid}/stream")
async def match_stream(ws: WebSocket, mid: str):
    await ws.accept()
    _connections[mid].add(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        _connections[mid].discard(ws)
