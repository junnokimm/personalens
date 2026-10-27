"""Project drafts and target groups; real execution storage comes later."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "projects",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("survey", postgresql.JSONB(), nullable=False),
        sa.Column("active_group_id", sa.String(100), nullable=False),
        sa.Column("model", postgresql.JSONB(), nullable=True),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("last_mutation_id", sa.String(100), nullable=False),
        sa.Column("last_mutation_hash", sa.String(64), nullable=False),
        sa.Column("updated", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("revision > 0"),
    )
    op.create_index("ix_projects_updated", "projects", ["updated"])
    op.create_table(
        "target_groups",
        sa.Column("project_id", sa.String(100), sa.ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("count", sa.Integer(), nullable=True),
        sa.Column("filters", postgresql.JSONB(), nullable=False),
        sa.Column("cohort", postgresql.JSONB(), nullable=True),
        sa.CheckConstraint("count IS NULL OR count BETWEEN 0 AND 9999"),
    )


def downgrade():
    op.drop_table("target_groups")
    op.drop_index("ix_projects_updated", table_name="projects")
    op.drop_table("projects")
