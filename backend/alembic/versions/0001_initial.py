from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    op.create_table(
        "sport",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False, unique=True),
    )
    op.create_table(
        "ruleset",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("sport_id", sa.String(), sa.ForeignKey("sport.id"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("config", sa.JSON(), nullable=False),
    )
    op.create_table(
        "club",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), unique=True, nullable=False),
    )
    op.create_table(
        "player",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), nullable=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("club_id", sa.String(), sa.ForeignKey("club.id"), nullable=True),
    )
    op.create_table(
        "team",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("player_ids", sa.JSON(), nullable=False),
    )
    op.create_table(
        "tournament",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("sport_id", sa.String(), sa.ForeignKey("sport.id"), nullable=False),
        sa.Column("club_id", sa.String(), sa.ForeignKey("club.id"), nullable=True),
        sa.Column("name", sa.String(), nullable=False),
    )
    op.create_table(
        "stage",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("tournament_id", sa.String(), sa.ForeignKey("tournament.id"), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
    )
    op.create_table(
        "match",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("sport_id", sa.String(), sa.ForeignKey("sport.id"), nullable=False),
        sa.Column("stage_id", sa.String(), sa.ForeignKey("stage.id"), nullable=True),
        sa.Column("ruleset_id", sa.String(), sa.ForeignKey("ruleset.id"), nullable=True),
        sa.Column("best_of", sa.Integer(), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=True),
    )
    op.create_table(
        "match_participant",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("match_id", sa.String(), sa.ForeignKey("match.id"), nullable=False),
        sa.Column("side", sa.String(), nullable=False),
        sa.Column("player_ids", sa.JSON(), nullable=False),
    )
    op.create_table(
        "score_event",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("match_id", sa.String(), sa.ForeignKey("match.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
    )
    op.create_table(
        "rating",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("player_id", sa.String(), sa.ForeignKey("player.id"), nullable=False),
        sa.Column("sport_id", sa.String(), sa.ForeignKey("sport.id"), nullable=False),
        sa.Column("value", sa.Float(), server_default="1000", nullable=False),
    )

def downgrade():
    for t in [
        "rating", "score_event", "match_participant", "match",
        "stage", "tournament", "team", "player", "club", "ruleset", "sport"
    ]:
        op.drop_table(t)
