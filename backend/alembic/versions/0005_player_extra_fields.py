from alembic import op
import sqlalchemy as sa

revision = '0005_player_extra_fields'
down_revision = '0004_soft_delete_columns'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('player', sa.Column('photo_url', sa.String(), nullable=True))
    op.add_column('player', sa.Column('location', sa.String(), nullable=True))
    op.add_column('player', sa.Column('ranking', sa.Integer(), nullable=True))


def downgrade():
    op.drop_column('player', 'ranking')
    op.drop_column('player', 'location')
    op.drop_column('player', 'photo_url')
