from alembic import op
import sqlalchemy as sa

revision = '0005_comments'
down_revision = '0004_soft_delete_columns'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'comment',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('player_id', sa.String(), sa.ForeignKey('player.id'), nullable=False),
        sa.Column('user_id', sa.String(), sa.ForeignKey('user.id'), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
    )


def downgrade():
    op.drop_table('comment')
