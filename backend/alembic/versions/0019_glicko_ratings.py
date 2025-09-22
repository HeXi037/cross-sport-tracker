"""create glicko rating table

Revision ID: 0019_glicko_ratings
Revises: 0018_user_profile_photos
Create Date: 2024-05-08 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0019_glicko_ratings"
down_revision = "0018_user_profile_photos"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "glicko_rating",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("player_id", sa.String(), nullable=False),
        sa.Column("sport_id", sa.String(), nullable=False),
        sa.Column("rating", sa.Float(), nullable=False, server_default=sa.text("1500.0")),
        sa.Column("rd", sa.Float(), nullable=False, server_default=sa.text("350.0")),
        sa.Column(
            "last_updated",
            sa.DateTime(),
            nullable=True,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "player_id", "sport_id", name="uq_glicko_rating_player_id_sport_id"
        ),
    )


def downgrade() -> None:
    op.drop_table("glicko_rating")
