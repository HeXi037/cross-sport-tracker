import fakeredis.aioredis
from fastapi import FastAPI
from fastapi.testclient import TestClient
import ulid

from app.routers import streams


app = FastAPI()
app.include_router(streams.router)


def test_broadcast_reaches_multiple_clients() -> None:
    streams.redis_client = fakeredis.aioredis.FakeRedis(decode_responses=True)
    mid = str(ulid.new())
    with TestClient(app) as client1, TestClient(app) as client2:
        with client1.websocket_connect(f"/matches/{mid}/stream") as ws1, \
             client2.websocket_connect(f"/matches/{mid}/stream") as ws2:
            client1.portal.call(streams.broadcast, mid, {"msg": 1})
            assert ws1.receive_json() == {"msg": 1}
            assert ws2.receive_json() == {"msg": 1}

