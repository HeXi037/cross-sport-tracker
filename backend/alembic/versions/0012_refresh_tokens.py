from alembic import op
import sqlalchemy as sa

revision = '0012_refresh_tokens'
down_revision = '0011_rehash_sha256_passwords'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'refresh_token',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('user_id', sa.String(), sa.ForeignKey('user.id'), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('revoked', sa.Boolean(), nullable=False, default=False),
    )


def downgrade():
    op.drop_table('refresh_token')
