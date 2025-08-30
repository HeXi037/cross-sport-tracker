import asyncio
import os
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from app.models import Sport, RuleSet, Club, Player

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL environment variable is required")
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

engine = create_async_engine(DATABASE_URL, echo=False, pool_pre_ping=True)
Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def main():
    async with Session() as s:
        existing = (await s.execute(select(Sport))).scalars().all()
        have = {x.id for x in existing}
        for sid, name in [("padel", "Padel"), ("bowling", "Bowling")]:
            if sid not in have:
                s.add(Sport(id=sid, name=name))
        await s.commit()

        # basic rulesets
        existing_rs = {
            x.id for x in (await s.execute(select(RuleSet))).scalars().all()
        }
        rulesets = [
            RuleSet(
                id="padel-default",
                sport_id="padel",
                name="Padel default",
                config={"goldenPoint": False, "tiebreakTo": 7, "sets": 3},
            ),
            RuleSet(
                id="padel-golden",
                sport_id="padel",
                name="Padel golden point",
                config={"goldenPoint": True, "tiebreakTo": 7, "sets": 3},
            ),
            RuleSet(
                id="bowling-standard",
                sport_id="bowling",
                name="Bowling standard",
                config={"frames": 10, "tenthFrameBonus": True},
            ),
        ]
        for rs in rulesets:
            if rs.id not in existing_rs:
                s.add(rs)
        await s.commit()

        # sample club
        existing_clubs = {
            x.id for x in (await s.execute(select(Club))).scalars().all()
        }
        for cid, name in [("demo-club", "Demo Club")]:
            if cid not in existing_clubs:
                s.add(Club(id=cid, name=name))
        await s.commit()

        # sample player
        player_id = "01ARZ3NDEKTSV4RRFFQ69G5FAV"
        player_name = "Demo Player"
        existing_player = (
            await s.execute(select(Player).where(Player.name == player_name))
        ).scalars().first()
        if existing_player:
            if existing_player.id != player_id:
                existing_player.id = player_id
        else:
            s.add(Player(id=player_id, name=player_name, club_id="demo-club"))
        await s.commit()

if __name__ == "__main__":
    asyncio.run(main())
