"""add refresh token usage tracking and family id

Revision ID: 0032_refresh_token_family_tracking
Revises: 0031_user_must_change_password
Create Date: 2025-02-10 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0032_refresh_token_family_tracking"
down_revision: Union[str, None] = "0031_user_must_change_password"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "refresh_token",
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "refresh_token",
        sa.Column("family_id", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("refresh_token", "family_id")
    op.drop_column("refresh_token", "last_used_at")
