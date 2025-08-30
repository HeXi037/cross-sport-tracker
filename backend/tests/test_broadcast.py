import asyncio
import os
import sys

import redis.asyncio as redis

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.routers import streams


def test_broadcast_connection_error(monkeypatch):
    async def fake_publish(channel, message):
        raise redis.ConnectionError("unavailable")
    monkeypatch.setattr(streams.redis_client, "publish", fake_publish)

    async def call():
        await streams.broadcast("m1", {"foo": "bar"})

    asyncio.run(call())
