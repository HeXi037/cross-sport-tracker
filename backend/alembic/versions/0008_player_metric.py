from alembic import op
import sqlalchemy as sa

revision = '0008_player_metric'
down_revision = '0011_rehash_sha256_passwords'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'player_metric',
        sa.Column('player_id', sa.String(), sa.ForeignKey('player.id'), primary_key=True, nullable=False),
        sa.Column('sport_id', sa.String(), sa.ForeignKey('sport.id'), primary_key=True, nullable=False),
        sa.Column('metrics', sa.JSON(), nullable=False),
        sa.Column('milestones', sa.JSON(), nullable=False),
    )


def downgrade():
    op.drop_table('player_metric')
