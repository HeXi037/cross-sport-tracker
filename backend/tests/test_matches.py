import os
import sys
from pathlib import Path
import pytest
from fastapi import HTTPException

sys.path.append(str(Path(__file__).resolve().parents[1]))


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.anyio
async def test_create_match_by_name_rejects_duplicate_players(tmp_path):
    os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{tmp_path}/test.db"
    from app.db import engine, AsyncSessionLocal
    from app.models import Player
    from app.schemas import MatchCreateByName, ParticipantByName
    from app.routers.matches import create_match_by_name

    async with engine.begin() as conn:
        await conn.run_sync(Player.__table__.create)

    async with AsyncSessionLocal() as session:
        session.add(Player(id="p1", name="Alice"))
        await session.commit()
        body = MatchCreateByName(
            sport="padel",
            participants=[
                ParticipantByName(side="A", playerNames=["Alice"]),
                ParticipantByName(side="B", playerNames=["Alice"]),
            ],
        )
        with pytest.raises(HTTPException) as exc:
            await create_match_by_name(body, session)
        assert exc.value.status_code == 400
        assert exc.value.detail == "duplicate players: Alice"
