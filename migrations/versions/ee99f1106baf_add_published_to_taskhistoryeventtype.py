"""add published to taskhistoryeventtype

Revision ID: ee99f1106baf
Revises: f6d5e4bc35f6
Create Date: 2025-10-16 02:22:08.642899

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ee99f1106baf'
down_revision: Union[str, Sequence[str], None] = 'f6d5e4bc35f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Добавляем новое значение в ENUM
    
    op.execute("ALTER TYPE taskhistoryeventtype ADD VALUE 'CREATED'")
    op.execute("ALTER TYPE taskhistoryeventtype ADD VALUE 'PUBLISHED'")
    op.execute("ALTER TYPE taskhistoryeventtype ADD VALUE 'UPDATED'")


def downgrade() -> None:
    # ⚠️ PostgreSQL НЕ поддерживает удаление значений из ENUM!
    # Поэтому в downgrade мы ничего не делаем (или оставляем как есть)
    # Это ограничение PostgreSQL.
    pass