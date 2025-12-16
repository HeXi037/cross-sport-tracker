import os
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession, AsyncEngine, create_async_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.pool import NullPool, StaticPool


engine: Optional[AsyncEngine] = None
AsyncSessionLocal: Optional[sessionmaker] = None
Base = declarative_base()


def get_engine() -> AsyncEngine:
    """Return a lazily created SQLAlchemy engine.

    The engine is created on first use using the ``DATABASE_URL`` environment
    variable. Importing this module has no side effects so tests can set the
    environment variable at runtime. A ``RuntimeError`` is raised only if the
    function is called without ``DATABASE_URL`` being configured.
    """

    global engine, AsyncSessionLocal

    if engine is None:
        database_url = os.getenv("DATABASE_URL")
        if not database_url:
            raise RuntimeError("DATABASE_URL environment variable is required")

        if database_url.startswith("postgresql://"):
            database_url = database_url.replace(
                "postgresql://", "postgresql+asyncpg://", 1
            )

        engine_kwargs = {"echo": False, "pool_pre_ping": True}

        if database_url.startswith("sqlite"):
            # Avoid connection pooling for SQLite so tests don't leak connections
            # across event loops or keep file handles open between runs.
            if ":memory:" in database_url:
                # In-memory SQLite databases need a static pool to persist
                # across connections within the same process.
                engine_kwargs["poolclass"] = StaticPool
            else:
                engine_kwargs["poolclass"] = NullPool

        engine = create_async_engine(database_url, **engine_kwargs)
        AsyncSessionLocal = sessionmaker(
            engine, class_=AsyncSession, expire_on_commit=False
        )

    return engine


async def get_session() -> AsyncSession:
    """Provide a database session for FastAPI dependencies."""

    if AsyncSessionLocal is None:
        get_engine()

    assert AsyncSessionLocal is not None  # for type checkers
    async with AsyncSessionLocal() as session:
        yield session
