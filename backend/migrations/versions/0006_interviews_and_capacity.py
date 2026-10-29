"""Persistent interview queue, compact run metadata, and 10,000-person cohorts."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0006"
down_revision = "0005"
branch_labels = depends_on = None


def upgrade():
    op.drop_constraint("target_groups_count_check", "target_groups", type_="check")
    op.create_check_constraint("target_groups_count_check", "target_groups", "count IS NULL OR count BETWEEN 0 AND 10000")
    op.add_column("runs", sa.Column("group_info", JSONB(), nullable=True))
    op.execute("""UPDATE runs SET group_info = (group_snapshot - 'cohort') ||
        jsonb_build_object('cohortCreated', group_snapshot #> '{cohort,created}')""")
    op.alter_column("runs", "group_info", nullable=False)
    op.create_table("interview_turns",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("run_id", sa.String(100), nullable=False),
        sa.Column("persona_id", sa.String(100), nullable=False),
        sa.Column("request_id", sa.String(100), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("question_id", sa.String(100), nullable=True),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("answer", sa.Text(), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("error", sa.Text(), nullable=False),
        sa.Column("error_code", sa.String(80), nullable=False),
        sa.Column("prompt_version", sa.String(80), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=False),
        sa.Column("output_tokens", sa.Integer(), nullable=False),
        sa.Column("unknown_attempts", sa.Integer(), nullable=False),
        sa.Column("lease_token", sa.String(100)),
        sa.Column("lease_until", sa.DateTime(timezone=True)),
        sa.Column("created", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["run_id", "persona_id"], ["run_tasks.run_id", "run_tasks.persona_id"]),
        sa.UniqueConstraint("run_id", "persona_id", "request_id"),
        sa.UniqueConstraint("run_id", "persona_id", "sequence"),
        sa.CheckConstraint("status IN ('queued','running','completed','failed','cancelled')"))
    op.create_index("uq_interview_active", "interview_turns", ["run_id", "persona_id"], unique=True,
        postgresql_where=sa.text("status IN ('queued','running')"))
    op.create_index("ix_interview_queue", "interview_turns", ["status", "created"])


def downgrade():
    # Refuse a destructive downgrade if 10,000-person drafts still exist.
    op.drop_constraint("target_groups_count_check", "target_groups", type_="check")
    op.create_check_constraint("target_groups_count_check", "target_groups", "count IS NULL OR count BETWEEN 0 AND 9999")
    op.drop_table("interview_turns")
    op.drop_column("runs", "group_info")
