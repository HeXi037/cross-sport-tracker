"""add must_change_password flag to user

Revision ID: 0031_user_must_change_password
Revises: 0030_match_comments_chat
Create Date: 2025-02-07 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0031_user_must_change_password"
down_revision: Union[str, None] = "0030_match_comments_chat"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "user",
        sa.Column(
            "must_change_password",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.execute("UPDATE \"user\" SET must_change_password = false WHERE must_change_password IS NULL")


def downgrade() -> None:
    op.drop_column("user", "must_change_password")
