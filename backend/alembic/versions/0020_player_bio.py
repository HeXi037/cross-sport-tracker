"""add player bio column

Revision ID: 0020_player_bio
Revises: 0019_glicko_ratings
Create Date: 2025-02-14 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0020_player_bio"
down_revision = "0019_glicko_ratings"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column("player", sa.Column("bio", sa.Text(), nullable=True))

    player_table = sa.table(
        "player",
        sa.column("id", sa.String()),
        sa.column("bio", sa.Text()),
    )

    bind = op.get_bind()
    bind.execute(
        player_table.update().where(player_table.c.bio.is_(None)).values(bio="")
    )


def downgrade() -> None:
    op.drop_column("player", "bio")
