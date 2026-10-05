"""Add session_stats.seconds_spent (real seconds) and backfill from reviews

The old code did `minutes_spent += max(1, seconds // 60)`. Because the client
caps a card at 30 seconds, 30 // 60 == 0 -> every card added exactly 1 "minute",
so minutes_spent was actually a card counter (~6x too high). This migration
adds a seconds column and backfills history from reviews.time_spent_seconds.

Revision ID: 5efe8d14e8b2
Revises: 4efe8d14e8b1
Create Date: 2026-10-03 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '5efe8d14e8b2'
down_revision: Union[str, None] = '4efe8d14e8b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'session_stats',
        sa.Column('seconds_spent', sa.Integer(), nullable=True, server_default='0'),
    )

    # Backfill: real seconds come from the reviews themselves.
    op.execute("""
        INSERT INTO session_stats
            (user_id, session_date, module_type, category,
             minutes_spent, card_count, seconds_spent, created_at)
        SELECT r.user_id,
               r.review_time::date,
               'language',
               c.language,
               0,
               count(*),
               COALESCE(sum(r.time_spent_seconds), 0),
               now()
        FROM reviews r
        JOIN cards c ON c.id = r.card_id
        GROUP BY r.user_id, r.review_time::date, c.language
        ON CONFLICT (user_id, session_date, module_type, category) DO UPDATE
        SET seconds_spent = EXCLUDED.seconds_spent,
            card_count   = EXCLUDED.card_count,
            minutes_spent = round(EXCLUDED.seconds_spent / 60.0)::int
    """)

    # Any row still without seconds (e.g. obsidian-only days): derive from the
    # old counter so the number never jumps to zero.
    op.execute("""
        UPDATE session_stats
        SET seconds_spent = minutes_spent * 60
        WHERE COALESCE(seconds_spent, 0) = 0 AND minutes_spent > 0
    """)


def downgrade() -> None:
    op.drop_column('session_stats', 'seconds_spent')