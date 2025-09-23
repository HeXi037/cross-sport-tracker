"""add player biography column"""

from alembic import op
import sqlalchemy as sa


revision = "0020_player_bio"
down_revision = "0019_glicko_ratings"
branch_labels = None
depends_on = None

player_table = sa.table(
    "player",
    sa.column("id", sa.String()),
    sa.column("bio", sa.Text()),
)


def upgrade() -> None:
    op.add_column("player", sa.Column("bio", sa.Text(), nullable=True))

    connection = op.get_bind()
    connection.execute(player_table.update().values(bio=None))


def downgrade() -> None:
    op.drop_column("player", "bio")
