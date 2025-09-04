from alembic import op
import sqlalchemy as sa

revision = '0006_password_reset_tokens'
down_revision = '0005_users'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'password_reset_token',
        sa.Column('token_hash', sa.String(), primary_key=True),
        sa.Column('user_id', sa.String(), sa.ForeignKey('user.id'), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
    )


def downgrade():
    op.drop_table('password_reset_token')
