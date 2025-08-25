import asyncio

from sqlalchemy import select

from app.db import SessionLocal
from app.models import Sport, RuleSet, generate_ulid

SPORTS = [
    ("padel", "Padel"),
    ("bowling", "Bowling"),
]

RULESETS = [
    ("padel", "default", {"goldenPoint": False, "tiebreakTo": 7, "sets": 3}),
    ("padel", "golden-point", {"goldenPoint": True, "tiebreakTo": 7, "sets": 3}),
    ("bowling", "standard", {"frames": 10, "tenthFrameBonus": True}),
]


async def seed():
    async with SessionLocal() as session:
        for sid, name in SPORTS:
            exists = await session.get(Sport, sid)
            if not exists:
                session.add(Sport(id=sid, name=name))
        await session.commit()
        for sport_id, name, config in RULESETS:
            result = await session.execute(
                select(RuleSet).where(RuleSet.sport_id == sport_id, RuleSet.name == name)
            )
            if not result.scalars().first():
                session.add(RuleSet(id=generate_ulid(), sport_id=sport_id, name=name, config=config))
        await session.commit()


if __name__ == "__main__":
    asyncio.run(seed())
