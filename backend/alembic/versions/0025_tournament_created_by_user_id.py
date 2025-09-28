"""Add created_by_user_id to tournament"""

from alembic import op
import sqlalchemy as sa


revision = "0025_tournament_created_by_user_id"
down_revision = "0024_stage_config_and_standings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tournament",
        sa.Column("created_by_user_id", sa.String(), nullable=True),
    )
    op.create_foreign_key(
        "fk_tournament_created_by_user",
        "tournament",
        "user",
        ["created_by_user_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_tournament_created_by_user", "tournament", type_="foreignkey")
    op.drop_column("tournament", "created_by_user_id")
