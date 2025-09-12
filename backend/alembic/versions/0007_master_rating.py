from alembic import op
import sqlalchemy as sa

revision = '0007_master_rating'
down_revision = '0006_badges'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'master_rating',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('player_id', sa.String(), sa.ForeignKey('player.id'), nullable=False),
        sa.Column('value', sa.Float(), nullable=False),
    )
    op.create_index('ix_master_rating_player_id', 'master_rating', ['player_id'], unique=True)


def downgrade():
    op.drop_index('ix_master_rating_player_id', table_name='master_rating')
    op.drop_table('master_rating')
