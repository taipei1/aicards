"""Add card_phrases cache for Learning phrase mode

Revision ID: 6efe8d14e8b3
Revises: 5efe8d14e8b2
Create Date: 2026-11-13 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = '6efe8d14e8b3'
down_revision: Union[str, None] = '5efe8d14e8b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'card_phrases',
        sa.Column('id', sa.Integer(), primary_key=True, nullable=False),
        sa.Column('card_id', sa.Integer(), nullable=False),
        sa.Column('phrase', sa.Text(), nullable=False),
        sa.Column('translation', sa.Text(), nullable=False),
        sa.Column(
            'target_spans',
            postgresql.ARRAY(sa.String()),
            nullable=False,
            server_default=sa.text("'{}'::varchar[]"),
        ),
        sa.Column(
            'translation_spans',
            postgresql.ARRAY(sa.String()),
            nullable=False,
            server_default=sa.text("'{}'::varchar[]"),
        ),
        sa.Column('model', sa.String(length=255), nullable=True),
        sa.Column('source_hash', sa.String(length=64), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(['card_id'], ['cards.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('card_id', name='uq_card_phrase'),
    )
    op.create_index('idx_card_phrase_card', 'card_phrases', ['card_id'])


def downgrade() -> None:
    op.drop_index('idx_card_phrase_card', table_name='card_phrases')
    op.drop_table('card_phrases')
