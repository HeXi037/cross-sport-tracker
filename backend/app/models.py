from datetime import datetime
from typing import List, Optional

import ulid
from sqlalchemy import String, ForeignKey, JSON, DateTime, Float
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def generate_ulid() -> str:
    return str(ulid.new())


class Base(DeclarativeBase):
    pass


class Sport(Base):
    __tablename__ = "sport"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, unique=True)


class RuleSet(Base):
    __tablename__ = "ruleset"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_ulid)
    sport_id: Mapped[str] = mapped_column(ForeignKey("sport.id"))
    name: Mapped[str] = mapped_column(String)
    config: Mapped[dict] = mapped_column(JSON)
    sport: Mapped["Sport"] = relationship()


class Player(Base):
    __tablename__ = "player"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_ulid)
    name: Mapped[str] = mapped_column(String)


class Match(Base):
    __tablename__ = "match"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_ulid)
    sport_id: Mapped[str] = mapped_column(ForeignKey("sport.id"))
    ruleset_id: Mapped[Optional[str]] = mapped_column(ForeignKey("ruleset.id"), nullable=True)
    metadata: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    sport: Mapped["Sport"] = relationship()
    ruleset: Mapped[Optional["RuleSet"]] = relationship()
    participants: Mapped[List["MatchParticipant"]] = relationship(back_populates="match")
    events: Mapped[List["ScoreEvent"]] = relationship(back_populates="match")


class MatchParticipant(Base):
    __tablename__ = "match_participant"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_ulid)
    match_id: Mapped[str] = mapped_column(ForeignKey("match.id"))
    side: Mapped[str] = mapped_column(String)
    player_ids: Mapped[list] = mapped_column(JSON)
    match: Mapped["Match"] = relationship(back_populates="participants")


class ScoreEvent(Base):
    __tablename__ = "score_event"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_ulid)
    match_id: Mapped[str] = mapped_column(ForeignKey("match.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    type: Mapped[str] = mapped_column(String)
    payload: Mapped[dict] = mapped_column(JSON)
    match: Mapped["Match"] = relationship(back_populates="events")


class Rating(Base):
    __tablename__ = "rating"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_ulid)
    player_id: Mapped[str] = mapped_column(ForeignKey("player.id"))
    sport_id: Mapped[str] = mapped_column(ForeignKey("sport.id"))
    value: Mapped[float] = mapped_column(Float, default=1000.0)
