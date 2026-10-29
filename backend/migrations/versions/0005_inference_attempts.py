"""Bounded, durable inference attempts and provider-reported usage."""
from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = depends_on = None


def upgrade():
    op.create_table("inference_attempts",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("run_id", sa.String(100), nullable=False),
        sa.Column("persona_id", sa.String(100), nullable=False),
        sa.Column("question_id", sa.String(100), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=False),
        sa.Column("output_tokens", sa.Integer(), nullable=False),
        sa.Column("error_code", sa.String(80), nullable=False),
        sa.Column("created", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["run_id", "persona_id"], ["run_tasks.run_id", "run_tasks.persona_id"]))
    op.create_index("ix_inference_attempts_run_id", "inference_attempts", ["run_id"])


def downgrade():
    op.drop_table("inference_attempts")
