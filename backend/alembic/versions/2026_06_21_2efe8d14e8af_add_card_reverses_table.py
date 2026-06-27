"""Add card_reverses table

Revision ID: 2efe8d14e8af
Revises: 1efe8d14e8ae
Create Date: 2026-06-21 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2efe8d14e8af'
down_revision: Union[str, None] = '1efe8d14e8ae'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('card_reverses',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('card_id', sa.Integer(), nullable=False),
        sa.Column('stability', sa.Float(), nullable=True, server_default='1.0'),
        sa.Column('difficulty', sa.Float(), nullable=True, server_default='5.0'),
        sa.Column('last_reviewed', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['card_id'], ['cards.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('card_id', name='uq_reverse_card')
    )
    op.create_index('idx_reverse_card', 'card_reverses', ['card_id'], unique=False)
    op.create_index('idx_reverse_due', 'card_reverses', ['card_id', 'last_reviewed', 'stability'], unique=False)
    op.create_index(op.f('ix_card_reverses_id'), 'card_reverses', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_card_reverses_id'), table_name='card_reverses')
    op.drop_index('idx_reverse_due', table_name='card_reverses')
    op.drop_index('idx_reverse_card', table_name='card_reverses')
    op.drop_table('card_reverses')
