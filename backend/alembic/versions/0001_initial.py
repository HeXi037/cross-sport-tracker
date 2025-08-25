"""initial tables"""

from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sport",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False, unique=True),
    )
    op.create_table(
        "ruleset",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("sport_id", sa.String(), sa.ForeignKey("sport.id")),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("config", sa.JSON(), nullable=False),
    )
    op.create_table(
        "player",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
    )
    op.create_table(
        "match",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("sport_id", sa.String(), sa.ForeignKey("sport.id")),
        sa.Column("ruleset_id", sa.String(), sa.ForeignKey("ruleset.id"), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=True),
    )
    op.create_table(
        "match_participant",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("match_id", sa.String(), sa.ForeignKey("match.id")),
        sa.Column("side", sa.String(), nullable=False),
        sa.Column("player_ids", sa.JSON(), nullable=False),
    )
    op.create_table(
        "score_event",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("match_id", sa.String(), sa.ForeignKey("match.id")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
    )
    op.create_table(
        "rating",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("player_id", sa.String(), sa.ForeignKey("player.id")),
        sa.Column("sport_id", sa.String(), sa.ForeignKey("sport.id")),
        sa.Column("value", sa.Float(), nullable=False, server_default="1000"),
    )


def downgrade() -> None:
    op.drop_table("rating")
    op.drop_table("score_event")
    op.drop_table("match_participant")
    op.drop_table("match")
    op.drop_table("player")
    op.drop_table("ruleset")
    op.drop_table("sport")
