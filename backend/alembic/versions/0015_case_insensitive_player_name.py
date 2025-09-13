"""add case-insensitive unique constraint to player name

Revision ID: 0015_case_insensitive_player_name
Revises: 0014_hash_refresh_tokens
Create Date: 2025-01-01 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "0015_case_insensitive_player_name"
down_revision = "0014_hash_refresh_tokens"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("player") as batch_op:
        batch_op.drop_constraint("uq_player_name", type_="unique")
    op.create_index(
        "uq_player_name_lower",
        "player",
        [sa.text("lower(name)")],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_player_name_lower", table_name="player")
    with op.batch_alter_table("player") as batch_op:
        batch_op.create_unique_constraint("uq_player_name", ["name"])

