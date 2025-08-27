from alembic import op
import sqlalchemy as sa

revision = '0003_match_meta_and_unique_player_names'
down_revision = '0002_match_details'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('match', sa.Column('played_at', sa.DateTime(), nullable=True))
    op.add_column('match', sa.Column('location', sa.String(), nullable=True))
    op.create_unique_constraint('uq_player_name', 'player', ['name'])


def downgrade():
    op.drop_constraint('uq_player_name', 'player', type_='unique')
    op.drop_column('match', 'location')
    op.drop_column('match', 'played_at')
