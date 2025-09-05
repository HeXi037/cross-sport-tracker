from alembic import op
import sqlalchemy as sa

revision = '0006_player_ids_to_json'
down_revision = (
    '0005_add_player_columns',
    '0005_badges',
    '0005_comments',
    '0005_master_rating',
    '0005_users',
)
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column(
        'team',
        'player_ids',
        type_=sa.JSON(),
        postgresql_using='to_json(player_ids)'
    )
    op.alter_column(
        'match_participant',
        'player_ids',
        type_=sa.JSON(),
        postgresql_using='to_json(player_ids)'
    )


def downgrade():
    op.alter_column(
        'match_participant',
        'player_ids',
        type_=sa.ARRAY(sa.String()),
        postgresql_using='ARRAY(SELECT json_array_elements_text(player_ids))'
    )
    op.alter_column(
        'team',
        'player_ids',
        type_=sa.ARRAY(sa.String()),
        postgresql_using='ARRAY(SELECT json_array_elements_text(player_ids))'
    )
