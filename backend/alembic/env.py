import os, sys
sys.path.append(os.path.dirname(os.path.dirname(__file__)))  # ensure /app on sys.path

from alembic import context
from sqlalchemy import pool
from app.db import Base
from app import models  # noqa: F401  # ensure models import to populate metadata

# Alembic config
config = context.config

# Try logging config, but skip if INI lacks sections
try:
    from logging.config import fileConfig
    if config.config_file_name:
        fileConfig(config.config_file_name, disable_existing_loggers=False)
except Exception:
    pass  # proceed without INI-based logging

target_metadata = Base.metadata
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL environment variable is required")

if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace(
        "postgresql://", "postgresql+asyncpg://", 1
    )

def run_migrations_offline():
    context.configure(
        url=DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()

def _run_sync_migrations(connection):
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()

async def run_migrations_online():
    from sqlalchemy.ext.asyncio import create_async_engine
    engine = create_async_engine(DATABASE_URL, poolclass=pool.NullPool)
    async with engine.connect() as connection:
        await connection.run_sync(_run_sync_migrations)
    await engine.dispose()

if context.is_offline_mode():
    run_migrations_offline()
else:
    import asyncio
    asyncio.run(run_migrations_online())
