"""add unique constraint to player_badge

Revision ID: 0017_unique_player_badges
Revises: 0016_structured_player_location
"""

from alembic import op
import sqlalchemy as sa


revision = "0017_unique_player_badges"
down_revision = "0016_structured_player_location"
branch_labels = None
depends_on = None


player_badge_table = sa.table(
    "player_badge",
    sa.column("id", sa.String()),
    sa.column("player_id", sa.String()),
    sa.column("badge_id", sa.String()),
)


def upgrade() -> None:
    connection = op.get_bind()
    rows = connection.execute(
        sa.select(
            player_badge_table.c.id,
            player_badge_table.c.player_id,
            player_badge_table.c.badge_id,
        ).order_by(
            player_badge_table.c.player_id,
            player_badge_table.c.badge_id,
            player_badge_table.c.id,
        )
    ).all()

    seen_keys = set()
    duplicate_ids = []
    for row in rows:
        key = (row.player_id, row.badge_id)
        if key in seen_keys:
            duplicate_ids.append(row.id)
        else:
            seen_keys.add(key)

    if duplicate_ids:
        connection.execute(
            sa.delete(player_badge_table).where(
                player_badge_table.c.id.in_(duplicate_ids)
            )
        )

    op.create_unique_constraint(
        "uq_player_badge_player_id_badge_id",
        "player_badge",
        ["player_id", "badge_id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_player_badge_player_id_badge_id",
        "player_badge",
        type_="unique",
    )
