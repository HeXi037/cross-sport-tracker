"""Shim: align graph for convert_player_ids_to_json

This migration is intentionally a no-op. It exists to provide the expected
revision id so later migrations (0011/0012/…) can resolve the graph.
"""
from alembic import op  # noqa: F401
import sqlalchemy as sa  # noqa: F401

revision = "0010_convert_player_ids_to_json"
down_revision = "0009_comments"
branch_labels = None
depends_on = None

def upgrade():
    # no-op: DB already reflects desired state for this deployment
    pass

def downgrade():
    # no-op
    pass
