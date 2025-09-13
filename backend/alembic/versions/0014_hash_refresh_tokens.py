"""hash existing refresh tokens

Revision ID: 0014_hash_refresh_tokens
Revises: 0013_merge_heads
Create Date: 2024-01-01 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
import hashlib

revision = "0014_hash_refresh_tokens"
down_revision = "0013_merge_heads"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("refresh_token", "id", new_column_name="token_hash")
    refresh_token = sa.table(
        "refresh_token",
        sa.column("token_hash", sa.String),
    )
    bind = op.get_bind()
    rows = bind.execute(sa.select(refresh_token.c.token_hash)).fetchall()
    for (token,) in rows:
        hashed = hashlib.sha256(token.encode()).hexdigest()
        bind.execute(
            refresh_token.update()
            .where(refresh_token.c.token_hash == token)
            .values(token_hash=hashed)
        )


def downgrade() -> None:
    op.alter_column("refresh_token", "token_hash", new_column_name="id")
