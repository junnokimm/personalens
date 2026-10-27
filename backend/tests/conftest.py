import os
from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.database import get_session
from app.main import app


@pytest.fixture
def database():
    url = os.environ.get("PERSONA_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set PERSONA_TEST_DATABASE_URL to run real PostgreSQL integration tests.")
    # Each test migrates and removes ONLY its own randomly named schema, not the app's data.
    schema = "test_" + uuid4().hex
    admin = create_engine(url)
    with admin.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_engine(url, connect_args={"options": f"-csearch_path={schema}"})
    try:
        config = Config(str(Path(__file__).parents[1] / "alembic.ini"))
        with engine.begin() as connection:
            config.attributes["connection"] = connection
            command.upgrade(config, "head")
        yield engine
    finally:
        engine.dispose()
        with admin.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()


@pytest.fixture
def raw_client(database):
    def session():
        with Session(database, expire_on_commit=False) as db:
            yield db
    app.dependency_overrides[get_session] = session
    from app.auth import _attempts
    _attempts.clear()
    with TestClient(app, headers={"X-Persona-Request": "1"}) as client:
        yield client
    app.dependency_overrides.clear()


@pytest.fixture
def client(raw_client):
    result = raw_client.post("/api/v1/auth/setup", json={"username": "test-admin", "password": "fake-password-123", "name": "테스트 관리자"})
    assert result.status_code == 201, result.text
    raw_client.headers["X-Persona-User"] = result.json()["user"]["id"]
    return raw_client
