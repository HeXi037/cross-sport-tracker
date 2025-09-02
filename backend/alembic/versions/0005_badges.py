from alembic import op
import sqlalchemy as sa

revision = '0005_badges'
down_revision = '0004_soft_delete_columns'
branch_labels = None
depends_on = None

def upgrade():
    op.create_table(
        'badge',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('name', sa.String(), nullable=False, unique=True),
        sa.Column('icon', sa.String(), nullable=True),
    )
    op.create_table(
        'player_badge',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('player_id', sa.String(), sa.ForeignKey('player.id'), nullable=False),
        sa.Column('badge_id', sa.String(), sa.ForeignKey('badge.id'), nullable=False),
    )


def downgrade():
    op.drop_table('player_badge')
    op.drop_table('badge')
