"""add case-insensitive uniqueness to player name

Revision ID: 0014_player_name_lower_index
Revises: 0013_reconcile_refresh_tokens
Create Date: 2025-09-17
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0014_player_name_lower_index"
down_revision = "0013_reconcile_refresh_tokens"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("player") as batch_op:
        batch_op.drop_constraint("uq_player_name", type_="unique")
    op.create_index(
        "ix_player_name_lower",
        "player",
        [sa.text("lower(name)")],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_player_name_lower", table_name="player")
    op.create_unique_constraint("uq_player_name", "player", ["name"])
