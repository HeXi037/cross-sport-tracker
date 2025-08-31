from alembic import op
import sqlalchemy as sa


revision = '0004_soft_delete_columns'
down_revision = '0003_match_meta_unique_names'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('player', sa.Column('deleted_at', sa.DateTime(), nullable=True))
    op.add_column('match', sa.Column('deleted_at', sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column('match', 'deleted_at')
    op.drop_column('player', 'deleted_at')

