from sqlalchemy.orm import relationship
from sqlalchemy import (
    Column,
    String,
    DateTime,
    ForeignKey,
    JSON,
    Integer,
    Float,
    Boolean,
    Text,
)
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
    name = Column(String, nullable=False, unique=True)
    club_id = Column(String, ForeignKey("club.id"), nullable=True)
    photo_url = Column(String, nullable=True)
    location = Column(String, nullable=True)
    ranking = Column(Integer, nullable=True)
    deleted_at = Column(DateTime, nullable=True)


class Badge(Base):
    __tablename__ = "badge"
    id = Column(String, primary_key=True)
    name = Column(String, nullable=False, unique=True)
    icon = Column(String, nullable=True)


class PlayerBadge(Base):
    __tablename__ = "player_badge"
    id = Column(String, primary_key=True)
    player_id = Column(String, ForeignKey("player.id"), nullable=False)
    badge_id = Column(String, ForeignKey("badge.id"), nullable=False)

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
    played_at = Column(DateTime, nullable=True)
    location = Column(String, nullable=True)
    details = Column(JSON, nullable=True)
    deleted_at = Column(DateTime, nullable=True)

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


class MasterRating(Base):
    """Aggregated rating across all sports for a player."""

    __tablename__ = "master_rating"
    id = Column(String, primary_key=True)
    player_id = Column(String, ForeignKey("player.id"), nullable=False)
    value = Column(Float, nullable=False)


class PlayerMetric(Base):
    __tablename__ = "player_metric"
    player_id = Column(String, ForeignKey("player.id"), primary_key=True)
    sport_id = Column(String, ForeignKey("sport.id"), primary_key=True)
    metrics = Column(JSON, nullable=False, default=dict)
    milestones = Column(JSON, nullable=False, default=list)


class User(Base):
    __tablename__ = "user"
    id = Column(String, primary_key=True)
    username = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    is_admin = Column(Boolean, nullable=False, default=False)


class PasswordResetToken(Base):
    """Stores password reset tokens for users."""

    __tablename__ = "password_reset_token"
    token_hash = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("user.id"), nullable=False)
    expires_at = Column(DateTime, nullable=False)


class RefreshToken(Base):
    """Stores refresh tokens for users."""

    __tablename__ = "refresh_token"
    token_hash = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("user.id"), nullable=False)
    expires_at = Column(DateTime, nullable=False)


class Comment(Base):
    __tablename__ = "comment"
    id = Column(String, primary_key=True)
    player_id = Column(String, ForeignKey("player.id"), nullable=False)
    user_id = Column(String, ForeignKey("user.id"), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    deleted_at = Column(DateTime, nullable=True)

    user = relationship("User")
