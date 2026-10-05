"""Add app_settings table (LLM gateway settings set via UI)

Revision ID: 3efe8d14e8b0
Revises: 2efe8d14e8af
Create Date: 2026-10-03 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3efe8d14e8b0'
down_revision: Union[str, None] = '2efe8d14e8af'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('app_settings',
        sa.Column('key', sa.String(length=255), nullable=False),
        sa.Column('value', sa.Text(), nullable=False, server_default=''),
        sa.Column('updated_at', sa.DateTime(), nullable=True, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('key')
    )


def downgrade() -> None:
    op.drop_table('app_settings')
