"""Persist one grounded project trend summary per completed run."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0007"
down_revision = "0006"
branch_labels = depends_on = None


def upgrade():
    op.create_table("run_trends",
        sa.Column("run_id", sa.String(100), sa.ForeignKey("runs.id"), primary_key=True),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("prompt_version", sa.String(80), nullable=False),
        sa.Column("source", JSONB(), nullable=True),
        sa.Column("source_hash", sa.String(64), nullable=False),
        sa.Column("evidence", JSONB(), nullable=False),
        sa.Column("content", JSONB(), nullable=True),
        sa.Column("error", sa.Text(), nullable=False),
        sa.Column("error_code", sa.String(80), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=False),
        sa.Column("output_tokens", sa.Integer(), nullable=False),
        sa.Column("unknown_attempts", sa.Integer(), nullable=False),
        sa.Column("lease_token", sa.String(100)),
        sa.Column("lease_until", sa.DateTime(timezone=True)),
        sa.Column("created", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("status IN ('queued','running','completed','failed')"))
    op.create_index("ix_trend_queue", "run_trends", ["status", "created"])


def downgrade():
    op.drop_table("run_trends")
