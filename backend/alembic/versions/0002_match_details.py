from alembic import op
import sqlalchemy as sa

revision = '0002_match_details'
down_revision = '0001_initial'
branch_labels = None
depends_on = None

def upgrade():
    op.alter_column('match', 'metadata', new_column_name='details')


def downgrade():
    op.alter_column('match', 'details', new_column_name='metadata')
