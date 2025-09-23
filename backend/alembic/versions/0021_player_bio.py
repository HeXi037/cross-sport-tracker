"""Add bio column to player"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0021_player_bio"
down_revision = "0020_player_social_links"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("player", sa.Column("bio", sa.Text(), nullable=True))
    op.execute(sa.text("UPDATE player SET bio = '' WHERE bio IS NULL"))


def downgrade() -> None:
    op.execute(sa.text("UPDATE player SET bio = NULL"))
    op.drop_column("player", "bio")
