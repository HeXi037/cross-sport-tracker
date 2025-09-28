"""Add padel_americano sport entry"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import table, column, String, select


revision = "0026_padel_americano_leaderboard"
down_revision = "0025_tournament_created_by_user_id"
branch_labels = None
depends_on = None


sport_table = table(
    "sport",
    column("id", String),
    column("name", String),
)


def upgrade() -> None:
    conn = op.get_bind()
    existing = conn.execute(
        select(sport_table.c.id).where(sport_table.c.id == "padel_americano")
    ).scalar_one_or_none()
    if existing is None:
        conn.execute(
            sport_table.insert().values(id="padel_americano", name="Padel Americano")
        )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sport_table.delete().where(sport_table.c.id == "padel_americano")
    )
