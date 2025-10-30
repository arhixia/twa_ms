"""add all TaskHistoryEventType values in snake_case

Revision ID: 155644727f45
Revises: ee99f1106baf
Create Date: 2025-10-16 02:29:13.965200

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '155644727f45'
down_revision: Union[str, Sequence[str], None] = 'ee99f1106baf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Добавляем ВСЕ значения в правильном (snake_case) стиле
    # Список значений, которые нужно добавить
    new_values = ["created", "published", "updated"]

    for val in new_values:
        op.execute(f"""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_enum
                    WHERE enumlabel = '{val}'
                    AND enumtypid = (
                        SELECT oid FROM pg_type WHERE typname = 'taskhistoryeventtype'
                    )
                ) THEN
                    ALTER TYPE taskhistoryeventtype ADD VALUE '{val}';
                END IF;
            END
            $$;
        """)


def downgrade() -> None:
    # PostgreSQL не поддерживает удаление значений из ENUM
    pass