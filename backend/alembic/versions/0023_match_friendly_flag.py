"""Add friendly flag to matches"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0023_match_friendly_flag"
down_revision = "0022_player_hidden_flag"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "match",
        sa.Column(
            "is_friendly",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.execute(sa.text("UPDATE match SET is_friendly = FALSE WHERE is_friendly IS NULL"))
    op.alter_column("match", "is_friendly", server_default=None)


def downgrade() -> None:
    op.drop_column("match", "is_friendly")
