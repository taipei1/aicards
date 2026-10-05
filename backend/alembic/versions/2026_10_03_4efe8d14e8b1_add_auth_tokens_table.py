"""Add auth_tokens table (single shared-password gate)

Revision ID: 4efe8d14e8b1
Revises: 3efe8d14e8b0
Create Date: 2026-10-03 00:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4efe8d14e8b1'
down_revision: Union[str, None] = '3efe8d14e8b0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('auth_tokens',
        sa.Column('token', sa.String(length=64), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True, server_default=sa.func.now()),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('token')
    )
    op.create_index(op.f('ix_auth_tokens_token'), 'auth_tokens', ['token'], unique=False)
    op.create_index('idx_auth_token_expires', 'auth_tokens', ['expires_at'], unique=False)


def downgrade() -> None:
    op.drop_index('idx_auth_token_expires', table_name='auth_tokens')
    op.drop_index(op.f('ix_auth_tokens_token'), table_name='auth_tokens')
    op.drop_table('auth_tokens')