import asyncio
import json
import os
from contextlib import suppress

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import redis.asyncio as redis


router = APIRouter()


REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
redis_client = redis.from_url(REDIS_URL, decode_responses=True)


async def broadcast(mid: str, message: dict) -> None:
    """Publish a message for a match to all subscribers."""
    await redis_client.publish(mid, json.dumps(message))


@router.websocket("/matches/{mid}/stream")
async def match_stream(ws: WebSocket, mid: str) -> None:
    """Stream match updates via a Redis pub/sub channel."""
    await ws.accept()
    try:
        async with redis_client.pubsub() as pubsub:
            await pubsub.subscribe(mid)

            async def sender() -> None:
                try:
                    async for msg in pubsub.listen():
                        if msg.get("type") == "message":
                            await ws.send_json(json.loads(msg["data"]))
                except redis.ConnectionError:
                    await ws.close()

            send_task = asyncio.create_task(sender())
            try:
                while True:
                    await ws.receive_text()
            except WebSocketDisconnect:
                pass
            finally:
                send_task.cancel()
                with suppress(asyncio.CancelledError):
                    await send_task
                await pubsub.unsubscribe(mid)
    except redis.ConnectionError:
        await ws.close()

