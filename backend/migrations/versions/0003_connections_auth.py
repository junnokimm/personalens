"""User-owned projects, cookie sessions and encrypted model connections."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0003"
down_revision = "0002"
branch_labels = depends_on = None


def upgrade():
    op.create_table("users",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("username", sa.String(80), unique=True, nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("is_admin", sa.Boolean(), nullable=False),
        sa.Column("created", sa.DateTime(timezone=True), nullable=False))
    op.add_column("projects", sa.Column("owner_id", sa.String(100), sa.ForeignKey("users.id", name="fk_project_owner"), nullable=True))
    op.create_index("ix_projects_owner_id", "projects", ["owner_id"])
    op.create_table("auth_sessions",
        sa.Column("token_hash", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.String(100), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("expires", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_auth_sessions_user_id", "auth_sessions", ["user_id"])
    op.create_table("model_connections",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("owner_id", sa.String(100), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("provider", sa.String(30), nullable=False),
        sa.Column("scope", sa.String(20), nullable=False),
        sa.Column("base_url", sa.Text(), nullable=False),
        sa.Column("encrypted_key", sa.Text(), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("models", JSONB(), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("last_error", sa.Text(), nullable=False),
        sa.Column("checked_at", sa.DateTime(timezone=True)),
        sa.Column("updated", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("provider IN ('openai','anthropic','dgx')"),
        sa.CheckConstraint("scope IN ('private','shared')"))
    op.create_index("ix_model_connections_owner_id", "model_connections", ["owner_id"])


def downgrade():
    op.drop_table("model_connections")
    op.drop_table("auth_sessions")
    op.drop_column("projects", "owner_id")
    op.drop_table("users")
