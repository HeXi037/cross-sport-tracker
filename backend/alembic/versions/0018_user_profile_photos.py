"""Add optional profile photos for users."""

from alembic import op
import sqlalchemy as sa

revision = "0018_user_profile_photos"
down_revision = "0017_unique_player_badges"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user", sa.Column("photo_url", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("user", "photo_url")
