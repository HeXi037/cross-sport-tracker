import asyncio, uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from app.models import Sport, RuleSet
import os

DATABASE_URL = os.getenv("DATABASE_URL")
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
        rs = (await s.execute(select(RuleSet))).scalars().all()
        if not rs:
            s.add_all([
                RuleSet(id=str(uuid.uuid4()), sport_id="padel", name="Padel default", config={"goldenPoint": False, "tiebreakTo": 7, "sets": 3}),
                RuleSet(id=str(uuid.uuid4()), sport_id="padel", name="Padel golden point", config={"goldenPoint": True, "tiebreakTo": 7, "sets": 3}),
                RuleSet(id=str(uuid.uuid4()), sport_id="bowling", name="Bowling standard", config={"frames": 10, "tenthFrameBonus": True}),
            ])
            await s.commit()

if __name__ == "__main__":
    asyncio.run(main())
