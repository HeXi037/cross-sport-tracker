"""reconcile refresh tokens

Revision ID: 0013_reconcile_refresh_tokens
Revises: 0012_refresh_token_table, 0012_refresh_tokens
Create Date: 2025-09-16 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0013_reconcile_refresh_tokens"
down_revision = ("0012_refresh_token_table", "0012_refresh_tokens")
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("refresh_token")}

    if {"token", "created_at", "revoked_at"} & columns:
        with op.batch_alter_table("refresh_token") as batch_op:
            if "token" in columns:
                batch_op.drop_column("token")
            if "created_at" in columns:
                batch_op.drop_column("created_at")
            if "revoked_at" in columns:
                batch_op.drop_column("revoked_at")
            if "revoked" not in columns:
                batch_op.add_column(
                    sa.Column(
                        "revoked", sa.Boolean(), nullable=False, server_default=sa.false()
                    )
                )
            # remove server default now that column is populated
            batch_op.alter_column("revoked", server_default=None)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("refresh_token")}

    with op.batch_alter_table("refresh_token") as batch_op:
        if "revoked" in columns:
            batch_op.alter_column("revoked", server_default=sa.false())
            batch_op.drop_column("revoked")
        if "token" not in columns:
            batch_op.add_column(sa.Column("token", sa.String(), nullable=False))
            batch_op.create_unique_constraint("uq_refresh_token_token", ["token"])
        if "created_at" not in columns:
            batch_op.add_column(
                sa.Column(
                    "created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False
                )
            )
        if "revoked_at" not in columns:
            batch_op.add_column(sa.Column("revoked_at", sa.DateTime(), nullable=True))
