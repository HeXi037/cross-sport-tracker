"""add match audit log table

Revision ID: 0029_match_audit_log
Revises: 0028_match_club_id
Create Date: 2024-09-27
"""

from alembic import op
import sqlalchemy as sa


revision = "0029_match_audit_log"
down_revision = "0028_match_club_id"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "match_audit_log",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("match_id", sa.String(), sa.ForeignKey("match.id", ondelete="CASCADE"), nullable=False),
        sa.Column("actor_user_id", sa.String(), sa.ForeignKey("user.id"), nullable=True),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("metadata", sa.JSON(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_match_audit_log_match_id",
        "match_audit_log",
        ["match_id"],
    )


def downgrade():
    op.drop_index("ix_match_audit_log_match_id", table_name="match_audit_log")
    op.drop_table("match_audit_log")
