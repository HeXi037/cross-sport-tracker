# backend/alembic/versions/0012_refresh_tokens.py
from alembic import op
import sqlalchemy as sa

revision = "0012_refresh_tokens"
down_revision = "0011_rehash_sha256_passwords"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    tables = set(inspector.get_table_names())
    if "refresh_token" in tables:
        return

    op.create_table(
        "refresh_token",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(),
            sa.ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False, index=True),
        sa.Column(
            "revoked",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
            index=True,
        ),
    )

def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "refresh_token" in inspector.get_table_names():
        op.drop_table("refresh_token")
