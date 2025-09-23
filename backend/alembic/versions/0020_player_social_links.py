"""add player social links table"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0020_player_social_links"
down_revision = "0019_glicko_ratings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "player_social_link",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("player_id", sa.String(), nullable=False),
        sa.Column("label", sa.String(length=100), nullable=False),
        sa.Column("url", sa.String(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.ForeignKeyConstraint(["player_id"], ["player.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_player_social_link_player_id",
        "player_social_link",
        ["player_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_player_social_link_player_id", table_name="player_social_link")
    op.drop_table("player_social_link")
