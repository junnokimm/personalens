from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, ForeignKeyConstraint, Index, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class Project(Base):
    __tablename__ = "projects"
    __table_args__ = (CheckConstraint("revision > 0"),)

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    owner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(Text)
    description: Mapped[str] = mapped_column(Text)
    survey: Mapped[dict[str, Any]] = mapped_column(JSONB)
    active_group_id: Mapped[str] = mapped_column(String(100))
    model: Mapped[dict[str, str] | None] = mapped_column(JSONB, nullable=True)
    revision: Mapped[int] = mapped_column(Integer)
    last_mutation_id: Mapped[str] = mapped_column(String(100))
    last_mutation_hash: Mapped[str] = mapped_column(String(64))
    updated: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    groups: Mapped[list["TargetGroup"]] = relationship(
        back_populates="project", cascade="all, delete-orphan",
        order_by="TargetGroup.position", lazy="selectin",
    )


class TargetGroup(Base):
    __tablename__ = "target_groups"
    __table_args__ = (CheckConstraint("count IS NULL OR count BETWEEN 0 AND 9999"),)

    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True)
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    position: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(Text)
    count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    filters: Mapped[dict[str, list[str]]] = mapped_column(JSONB)
    cohort: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    project: Mapped[Project] = relationship(back_populates="groups")


class PersonaDataset(Base):
    __tablename__ = "persona_datasets"
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    source_path: Mapped[str] = mapped_column(Text)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSONB)
    created: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class PersonaCohort(Base):
    __tablename__ = "persona_cohorts"
    __table_args__ = (UniqueConstraint("project_id", "request_id"),)
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("persona_datasets.id"))
    request_id: Mapped[str] = mapped_column(String(100))
    request_hash: Mapped[str] = mapped_column(String(64))
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB)
    created: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class SurveyVersion(Base):
    __tablename__ = "survey_versions"
    __table_args__ = (UniqueConstraint("project_id", "version"),)
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    content_hash: Mapped[str] = mapped_column(String(64))
    document: Mapped[dict[str, Any]] = mapped_column(JSONB)
    created: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Run(Base):
    __tablename__ = "runs"
    __table_args__ = (
        UniqueConstraint("project_id", "number"), UniqueConstraint("project_id", "request_id"),
        Index("uq_active_run", "project_id", unique=True, postgresql_where=text("status IN ('queued', 'running')")),
        CheckConstraint("status IN ('queued','running','completed','partial_failed','failed','cancelled')"),
    )
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    number: Mapped[int] = mapped_column(Integer)
    request_id: Mapped[str] = mapped_column(String(100))
    request_hash: Mapped[str] = mapped_column(String(64))
    survey_version_id: Mapped[str] = mapped_column(ForeignKey("survey_versions.id"))
    survey: Mapped[dict[str, Any]] = mapped_column(JSONB)
    group_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB)
    engine: Mapped[dict[str, Any]] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(30))
    total: Mapped[int] = mapped_column(Integer)
    succeeded: Mapped[int] = mapped_column(Integer, default=0)
    failed: Mapped[int] = mapped_column(Integer, default=0)
    fail_note: Mapped[str] = mapped_column(Text, default="")
    created: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    finished: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class RunTask(Base):
    __tablename__ = "run_tasks"
    __table_args__ = (
        CheckConstraint("status IN ('queued','running','succeeded','failed','cancelled')"),
        Index("ix_task_claim", "status", "lease_until"),
    )
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id"), primary_key=True)
    persona_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    person_index: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(30))
    next_question: Mapped[int] = mapped_column(Integer, default=0)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    lease_token: Mapped[str | None] = mapped_column(String(100), nullable=True)
    lease_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    fail_once: Mapped[bool] = mapped_column(Boolean, default=False)
    error: Mapped[str] = mapped_column(Text, default="")


class Response(Base):
    __tablename__ = "responses"
    __table_args__ = (ForeignKeyConstraint(["run_id", "persona_id"], ["run_tasks.run_id", "run_tasks.persona_id"]),)
    run_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    persona_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    question_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB)


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    username: Mapped[str] = mapped_column(String(80), unique=True)
    name: Mapped[str] = mapped_column(String(100))
    password_hash: Mapped[str] = mapped_column(Text)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    created: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class AuthSession(Base):
    __tablename__ = "auth_sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    expires: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ModelConnection(Base):
    __tablename__ = "model_connections"
    __table_args__ = (CheckConstraint("provider IN ('openai','anthropic','dgx')"), CheckConstraint("scope IN ('private','shared')"))
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    provider: Mapped[str] = mapped_column(String(30))
    scope: Mapped[str] = mapped_column(String(20))
    base_url: Mapped[str] = mapped_column(Text)
    encrypted_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean)
    revision: Mapped[int] = mapped_column(Integer)
    models: Mapped[list] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(30))
    last_error: Mapped[str] = mapped_column(Text)
    checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated: Mapped[datetime] = mapped_column(DateTime(timezone=True))
