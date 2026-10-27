"""Immutable execution snapshots and durable persona jobs."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("survey_versions",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("project_id", sa.String(100), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("document", JSONB(), nullable=False),
        sa.Column("created", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("project_id", "version"))
    op.create_index("ix_survey_versions_project_id", "survey_versions", ["project_id"])
    op.create_table("runs",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("project_id", sa.String(100), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("number", sa.Integer(), nullable=False),
        sa.Column("request_id", sa.String(100), nullable=False),
        sa.Column("request_hash", sa.String(64), nullable=False),
        sa.Column("survey_version_id", sa.String(100), sa.ForeignKey("survey_versions.id"), nullable=False),
        sa.Column("survey", JSONB(), nullable=False),
        sa.Column("group_snapshot", JSONB(), nullable=False),
        sa.Column("engine", JSONB(), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("total", sa.Integer(), nullable=False),
        sa.Column("succeeded", sa.Integer(), nullable=False),
        sa.Column("failed", sa.Integer(), nullable=False),
        sa.Column("fail_note", sa.Text(), nullable=False),
        sa.Column("created", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("project_id", "number"), sa.UniqueConstraint("project_id", "request_id"),
        sa.CheckConstraint("status IN ('queued','running','completed','partial_failed','failed','cancelled')"))
    op.create_index("ix_runs_project_id", "runs", ["project_id"])
    op.create_index("uq_active_run", "runs", ["project_id"], unique=True, postgresql_where=sa.text("status IN ('queued','running')"))
    op.create_table("run_tasks",
        sa.Column("run_id", sa.String(100), sa.ForeignKey("runs.id"), primary_key=True),
        sa.Column("persona_id", sa.String(100), primary_key=True),
        sa.Column("person_index", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("next_question", sa.Integer(), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("lease_token", sa.String(100)), sa.Column("lease_until", sa.DateTime(timezone=True)),
        sa.Column("fail_once", sa.Boolean(), nullable=False), sa.Column("error", sa.Text(), nullable=False),
        sa.CheckConstraint("status IN ('queued','running','succeeded','failed','cancelled')"))
    op.create_index("ix_task_claim", "run_tasks", ["status", "lease_until"])
    op.create_table("responses",
        sa.Column("run_id", sa.String(100), primary_key=True),
        sa.Column("persona_id", sa.String(100), primary_key=True),
        sa.Column("question_id", sa.String(100), primary_key=True),
        sa.Column("payload", JSONB(), nullable=False),
        sa.ForeignKeyConstraint(["run_id", "persona_id"], ["run_tasks.run_id", "run_tasks.persona_id"]))
    op.execute("""CREATE FUNCTION protect_survey_version() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'Survey versions are immutable'; END $$""")
    op.execute("CREATE TRIGGER immutable_survey BEFORE UPDATE OR DELETE ON survey_versions FOR EACH ROW EXECUTE FUNCTION protect_survey_version()")
    op.execute("""CREATE FUNCTION protect_run_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF ROW(NEW.project_id, NEW.number, NEW.request_id, NEW.request_hash, NEW.survey_version_id, NEW.survey, NEW.group_snapshot, NEW.engine, NEW.total, NEW.created)
             IS DISTINCT FROM ROW(OLD.project_id, OLD.number, OLD.request_id, OLD.request_hash, OLD.survey_version_id, OLD.survey, OLD.group_snapshot, OLD.engine, OLD.total, OLD.created)
          THEN RAISE EXCEPTION 'Run snapshots are immutable'; END IF;
          RETURN NEW;
        END $$""")
    op.execute("CREATE TRIGGER immutable_run BEFORE UPDATE ON runs FOR EACH ROW EXECUTE FUNCTION protect_run_snapshot()")


def downgrade():
    op.drop_table("responses")
    op.drop_table("run_tasks")
    op.drop_table("runs")
    op.drop_table("survey_versions")
    op.execute("DROP FUNCTION protect_run_snapshot()")
    op.execute("DROP FUNCTION protect_survey_version()")
