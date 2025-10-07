"""add club id to matches

Revision ID: 0028_match_club_id
Revises: 0027_notifications
Create Date: 2024-05-20
"""

from alembic import op
import sqlalchemy as sa


revision = "0028_match_club_id"
down_revision = "0027_notifications"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "match",
        sa.Column("club_id", sa.String(), sa.ForeignKey("club.id"), nullable=True),
    )


def downgrade():
    op.drop_column("match", "club_id")

