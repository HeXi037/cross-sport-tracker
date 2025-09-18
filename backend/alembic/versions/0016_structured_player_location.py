"""add structured location fields to player"""

from alembic import op
import sqlalchemy as sa

from app.location_utils import normalize_location_fields

revision = "0016_structured_player_location"
down_revision = "0015_case_insensitive_player_name"
branch_labels = None
depends_on = None

player_table = sa.table(
    "player",
    sa.column("id", sa.String()),
    sa.column("location", sa.String()),
    sa.column("country_code", sa.String(length=2)),
    sa.column("region_code", sa.String(length=3)),
)


def upgrade() -> None:
    op.add_column("player", sa.Column("country_code", sa.String(length=2), nullable=True))
    op.add_column("player", sa.Column("region_code", sa.String(length=3), nullable=True))

    connection = op.get_bind()
    results = connection.execute(
        sa.select(player_table.c.id, player_table.c.location)
    ).all()

    for player_id, location in results:
        normalized_location, country_code, region_code = normalize_location_fields(
            location, None, None
        )
        if (
            normalized_location == location
            and country_code is None
            and region_code is None
        ):
            continue
        values = {
            "country_code": country_code,
            "region_code": region_code,
        }
        if normalized_location != location:
            values["location"] = normalized_location
        connection.execute(
            player_table.update()
            .where(player_table.c.id == player_id)
            .values(**values)
        )


def downgrade() -> None:
    op.drop_column("player", "region_code")
    op.drop_column("player", "country_code")
