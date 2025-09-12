from alembic import op
import sqlalchemy as sa
import re

revision = '0011_rehash_sha256_passwords'
down_revision = '0010_convert_player_ids_to_json'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    rows = conn.execute(sa.text('SELECT id, password_hash FROM "user"')).fetchall()
    legacy = [
        r for r in rows if r.password_hash and re.fullmatch(r"[a-f0-9]{64}", r.password_hash)
    ]
    if legacy:
        raise RuntimeError(
            f"{len(legacy)} users still have SHA-256 password hashes; reset these passwords before applying this migration."
        )


def downgrade():
    pass
