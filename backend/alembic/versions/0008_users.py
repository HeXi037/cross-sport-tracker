from alembic import op
import sqlalchemy as sa

revision = '0008_users'
down_revision = '0007_master_rating'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'user',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('username', sa.String(), nullable=False, unique=True),
        sa.Column('password_hash', sa.String(), nullable=False),
        sa.Column('is_admin', sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade():
    op.drop_table('user')
