"""match comment and chat tables

Revision ID: 0030_match_comments_chat
Revises: 0029_match_audit_log
Create Date: 2025-08-29 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0030_match_comments_chat"
down_revision = "0029_match_audit_log"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "match_comment",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("match_id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("parent_id", sa.String(), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["match_id"], ["match.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.ForeignKeyConstraint([
            "parent_id"
        ], ["match_comment.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_match_comment_match_id", "match_comment", ["match_id"], unique=False
    )
    op.create_index(
        "ix_match_comment_parent_id", "match_comment", ["parent_id"], unique=False
    )

    op.create_table(
        "chat_message",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("match_id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column(
            "channel",
            sa.String(),
            nullable=False,
            server_default="general",
        ),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["match_id"], ["match.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_chat_message_match_id", "chat_message", ["match_id"], unique=False
    )
    op.create_index(
        "ix_chat_message_channel", "chat_message", ["channel"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_chat_message_channel", table_name="chat_message")
    op.drop_index("ix_chat_message_match_id", table_name="chat_message")
    op.drop_table("chat_message")
    op.drop_index("ix_match_comment_parent_id", table_name="match_comment")
    op.drop_index("ix_match_comment_match_id", table_name="match_comment")
    op.drop_table("match_comment")
