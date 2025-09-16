"""Shim: align graph for rehash_sha256_passwords

This migration is intentionally a no-op. It exists to provide the expected
revision id so later migrations (0012/…) can resolve the graph.
"""
from alembic import op  # noqa: F401
import sqlalchemy as sa  # noqa: F401

revision = "0011_rehash_sha256_passwords"
down_revision = "0010_convert_player_ids_to_json"
branch_labels = None
depends_on = None

def upgrade():
    # no-op
    pass

def downgrade():
    # no-op
    pass
