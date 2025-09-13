from alembic import op
import sqlalchemy as sa

revision = '0012_refresh_token_table'
down_revision = '0011_rehash_sha256_passwords'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'refresh_token',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('user_id', sa.String(), sa.ForeignKey('user.id'), nullable=False),
        sa.Column('token', sa.String(), nullable=False, unique=True),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('revoked_at', sa.DateTime(), nullable=True),
    )


def downgrade():
    op.drop_table('refresh_token')
