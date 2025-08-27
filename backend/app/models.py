from sqlalchemy.orm import relationship
from sqlalchemy import Column, String, DateTime, ForeignKey, JSON, Integer, Float
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.sql import func
from .db import Base

class Sport(Base):
    __tablename__ = "sport"
    id = Column(String, primary_key=True)   # e.g., "padel", "bowling"
    name = Column(String, nullable=False, unique=True)

class RuleSet(Base):
    __tablename__ = "ruleset"
    id = Column(String, primary_key=True)
    sport_id = Column(String, ForeignKey("sport.id"), nullable=False)
    name = Column(String, nullable=False)
    config = Column(JSON, nullable=False)

class Club(Base):
    __tablename__ = "club"
    id = Column(String, primary_key=True)
    name = Column(String, nullable=False, unique=True)

class Player(Base):
    __tablename__ = "player"
    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=True)
    name = Column(String, nullable=False)
    club_id = Column(String, ForeignKey("club.id"), nullable=True)

class Team(Base):
    __tablename__ = "team"
    id = Column(String, primary_key=True)
    player_ids = Column(ARRAY(String), nullable=False)

class Tournament(Base):
    __tablename__ = "tournament"
    id = Column(String, primary_key=True)
    sport_id = Column(String, ForeignKey("sport.id"), nullable=False)
    club_id = Column(String, ForeignKey("club.id"), nullable=True)
    name = Column(String, nullable=False)

class Stage(Base):
    __tablename__ = "stage"
    id = Column(String, primary_key=True)
    tournament_id = Column(String, ForeignKey("tournament.id"), nullable=False)
    type = Column(String, nullable=False)  # "round_robin" | "single_elim"

class Match(Base):
    __tablename__ = "match"
    id = Column(String, primary_key=True)
    sport_id = Column(String, ForeignKey("sport.id"), nullable=False)
    stage_id = Column(String, ForeignKey("stage.id"), nullable=True)
    ruleset_id = Column(String, ForeignKey("ruleset.id"), nullable=True)
    best_of = Column(Integer, nullable=True)
    details = Column(JSON, nullable=True)

class MatchParticipant(Base):
    __tablename__ = "match_participant"
    id = Column(String, primary_key=True)
    match_id = Column(String, ForeignKey("match.id"), nullable=False)
    side = Column(String, nullable=False)  # "A" | "B"
    player_ids = Column(ARRAY(String), nullable=False)

class ScoreEvent(Base):
    __tablename__ = "score_event"
    id = Column(String, primary_key=True)
    match_id = Column(String, ForeignKey("match.id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    type = Column(String, nullable=False)
    payload = Column(JSON, nullable=False)

class Rating(Base):
    __tablename__ = "rating"
    id = Column(String, primary_key=True)
    player_id = Column(String, ForeignKey("player.id"), nullable=False)
    sport_id = Column(String, ForeignKey("sport.id"), nullable=False)
    value = Column(Float, nullable=False, default=1000)
