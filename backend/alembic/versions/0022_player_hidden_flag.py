"""Add hidden flag to player"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0022_player_hidden_flag"
down_revision = "0021_player_bio"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "player",
        sa.Column("hidden", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.execute(sa.text("UPDATE player SET hidden = FALSE WHERE hidden IS NULL"))
    op.alter_column("player", "hidden", server_default=None)


def downgrade() -> None:
    op.drop_column("player", "hidden")
