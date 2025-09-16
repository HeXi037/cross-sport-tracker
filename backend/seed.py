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
        for sid, name in [
            ("padel", "Padel"),
            ("bowling", "Bowling"),
            ("tennis", "Tennis"),
            ("pickleball", "Pickleball"),
            ("disc_golf", "Disc Golf"),
        ]:
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
            RuleSet(
                id="tennis-standard",
                sport_id="tennis",
                name="Tennis standard",
                config={"tiebreakTo": 7, "sets": 3},
            ),
            RuleSet(
                id="pickleball-standard",
                sport_id="pickleball",
                name="Pickleball standard",
                config={"pointsTo": 11, "winBy": 2, "bestOf": 3},
            ),
            RuleSet(
                id="disc-golf-standard",
                sport_id="disc_golf",
                name="Disc Golf standard",
                config={"holes": 18},
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
        existing_players = {
            x.id for x in (await s.execute(select(Player))).scalars().all()
        }
        players = [
            Player(id="demo-player", name="demo player", club_id="demo-club"),
            Player(
                id="padel-alex-ruiz",
                name="Alex Ruiz",
                club_id="demo-club",
            ),
            Player(
                id="padel-bella-fernandez",
                name="Bella Fernandez",
                club_id="demo-club",
            ),
            Player(
                id="padel-carlos-mendez",
                name="Carlos Mendez",
                club_id="demo-club",
            ),
            Player(
                id="padel-diana-soto",
                name="Diana Soto",
                club_id="demo-club",
            ),
            Player(
                id="padel-eli-vasquez",
                name="Eli Vasquez",
                club_id="demo-club",
            ),
            Player(
                id="padel-fiona-castro",
                name="Fiona Castro",
                club_id="demo-club",
            ),
        ]
        for p in players:
            if p.id not in existing_players:
                s.add(p)
        await s.commit()

if __name__ == "__main__":
    asyncio.run(main())
