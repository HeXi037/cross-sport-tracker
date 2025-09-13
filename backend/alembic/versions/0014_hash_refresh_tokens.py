"""rename refresh token id to token_hash and backfill hashes

Revision ID: 0014_hash_refresh_tokens
Revises: 0013_reconcile_refresh_tokens
Create Date: 2025-01-01 00:00:00.000000
"""

from alembic import op
import hashlib
import sqlalchemy as sa

revision = "0014_hash_refresh_tokens"
down_revision = "0013_reconcile_refresh_tokens"
branch_labels = None
depends_on = None

def upgrade() -> None:
    with op.batch_alter_table("refresh_token") as batch_op:
        batch_op.alter_column("id", new_column_name="token_hash")

    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT token_hash FROM refresh_token")).fetchall()
    for (token,) in rows:
        if len(token) == 64 and all(c in "0123456789abcdef" for c in token):
            continue
        hashed = hashlib.sha256(token.encode()).hexdigest()
        bind.execute(
            sa.text(
                "UPDATE refresh_token SET token_hash = :hashed WHERE token_hash = :token"
            ),
            {"hashed": hashed, "token": token},
        )

def downgrade() -> None:
    with op.batch_alter_table("refresh_token") as batch_op:
        batch_op.alter_column("token_hash", new_column_name="id")
