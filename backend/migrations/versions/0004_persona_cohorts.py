"""Registered Parquet versions and immutable, server-owned cohort snapshots."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0004"
down_revision = "0003"
branch_labels = depends_on = None


def upgrade():
    op.create_table("persona_datasets",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("source_path", sa.Text(), nullable=False),
        sa.Column("metadata_json", JSONB(), nullable=False),
        sa.Column("created", sa.DateTime(timezone=True), nullable=False))
    op.create_table("persona_cohorts",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("project_id", sa.String(100), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("dataset_id", sa.String(100), sa.ForeignKey("persona_datasets.id"), nullable=False),
        sa.Column("request_id", sa.String(100), nullable=False),
        sa.Column("request_hash", sa.String(64), nullable=False),
        sa.Column("payload", JSONB(), nullable=False),
        sa.Column("created", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("project_id", "request_id"))
    op.create_index("ix_persona_cohorts_project_id", "persona_cohorts", ["project_id"])
    op.execute("""
        CREATE FUNCTION protect_persona_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'Persona source snapshots are immutable'; END $$;
        CREATE TRIGGER immutable_persona_cohort BEFORE UPDATE OR DELETE ON persona_cohorts
        FOR EACH ROW EXECUTE FUNCTION protect_persona_snapshot();
        CREATE TRIGGER immutable_persona_dataset BEFORE UPDATE OR DELETE ON persona_datasets
        FOR EACH ROW EXECUTE FUNCTION protect_persona_snapshot();
    """)


def downgrade():
    op.drop_table("persona_cohorts")
    op.drop_table("persona_datasets")
    op.execute("DROP FUNCTION protect_persona_snapshot()")
