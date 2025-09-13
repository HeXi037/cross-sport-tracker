"""rename refresh token id to token_hash

Revision ID: 0014_hash_refresh_tokens
Revises: 0013_reconcile_refresh_tokens
Create Date: 2025-01-01 00:00:00.000000
"""

from alembic import op

revision = "0014_hash_refresh_tokens"
down_revision = "0013_reconcile_refresh_tokens"
branch_labels = None
depends_on = None

def upgrade() -> None:
    with op.batch_alter_table("refresh_token") as batch_op:
        batch_op.alter_column("id", new_column_name="token_hash")

def downgrade() -> None:
    with op.batch_alter_table("refresh_token") as batch_op:
        batch_op.alter_column("token_hash", new_column_name="id")
