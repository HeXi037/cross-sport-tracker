"""Add stage config column and stage standings table"""

from alembic import op
import sqlalchemy as sa


revision = "0024_stage_config_and_standings"
down_revision = "0023_match_friendly_flag"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("stage", sa.Column("config", sa.JSON(), nullable=True))

    op.create_table(
        "stage_standing",
        sa.Column("stage_id", sa.String(), nullable=False),
        sa.Column("player_id", sa.String(), nullable=False),
        sa.Column(
            "matches_played", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column("wins", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("losses", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("draws", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "points_scored", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column(
            "points_allowed", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column("points_diff", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("sets_won", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("sets_lost", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("points", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["player_id"], ["player.id"], name="fk_stage_player"),
        sa.ForeignKeyConstraint(["stage_id"], ["stage.id"], name="fk_stage"),
        sa.PrimaryKeyConstraint("stage_id", "player_id"),
    )


def downgrade() -> None:
    op.drop_table("stage_standing")
    op.drop_column("stage", "config")
