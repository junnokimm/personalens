import threading
from datetime import timedelta
from http.server import ThreadingHTTPServer

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.auth import COOKIE, now
from app.config import settings
from app.main import app
from app.mock_provider import Handler
from app.models import AuthSession, ModelConnection, Project, User
from app.providers import decrypt_key
from test_projects import document, operation
from test_runs import create as create_run, drain

PREFIX = "/api/v1"
ADMIN = {"username": "test-admin", "password": "fake-password-123", "name": "테스트 관리자"}
MEMBER = {"username": "test-member", "password": "fake-member-password", "name": "팀원"}


@pytest.fixture
def model_server(monkeypatch):
    calls = []
    class Recorded(Handler):
        def do_GET(self):
            calls.append((self.path, dict(self.headers)))
            super().do_GET()
    server = ThreadingHTTPServer(("127.0.0.1", 0), Recorded)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{server.server_port}"
    monkeypatch.setattr(settings, "mock_provider_base_url", base)
    monkeypatch.setattr(settings, "dgx_allowed_base_urls", [base + p for p in ("/dgx/v1", "/missing/v1", "/redirect/v1")])
    monkeypatch.setattr(settings, "encryption_key", Fernet.generate_key().decode())
    try:
        yield base, calls
    finally:
        server.shutdown(); server.server_close(); thread.join()


def register(client, provider="openai", **extra):
    body = dict(name="검증 " + provider, provider=provider, apiKey="fake-" + provider + "-test", **extra)
    response = client.post(PREFIX + "/connections", json=body)
    assert response.status_code == 201, response.text
    return response.json()


def edit(client, row, **changes):
    body = {k: row[k] for k in ("name", "provider", "scope", "baseUrl", "enabled")}
    return client.put(PREFIX + "/connections/" + row["id"], json={**body, "expectedRevision": row["revision"], **changes})


def member_client(client):
    assert client.post(PREFIX + "/auth/users", json=MEMBER).status_code == 201
    other = TestClient(app, headers={"X-Persona-Request": "1"})
    login = other.post(PREFIX + "/auth/login", json={k: MEMBER[k] for k in ("username", "password")})
    assert login.status_code == 200
    other.headers["X-Persona-User"] = login.json()["user"]["id"]
    return other


def test_setup_sessions_csrf_and_legacy_ownership(raw_client, database):
    assert raw_client.get(PREFIX + "/auth/session").json() == {"user": None, "needsSetup": True}
    assert raw_client.get(PREFIX + "/projects").status_code == 401
    # A legacy project existing before auth is preserved and claimed only once.
    from app.main import apply_document
    from app.schemas import SaveProject
    with Session(database) as db:
        project = Project(id="project-test", groups=[])
        apply_document(project, SaveProject.model_validate(operation()), "legacy", db)
        db.add(project); db.commit()
    rejected = raw_client.post(PREFIX + "/auth/setup", json=ADMIN, headers={"Origin": "https://untrusted.example"})
    assert rejected.status_code == 403
    response = raw_client.post(PREFIX + "/auth/setup", json=ADMIN)
    assert response.status_code == 201
    assert "HttpOnly" in response.headers["set-cookie"] and "SameSite=strict" in response.headers["set-cookie"]
    owner = response.json()["user"]["id"]
    assert raw_client.post(PREFIX + "/auth/setup", json=ADMIN).status_code == 409
    assert len(raw_client.get(PREFIX + "/projects").json()["projects"]) == 1
    assert raw_client.get(PREFIX + "/projects", headers={"X-Persona-User": "another-account"}).status_code == 401
    with Session(database) as db:
        assert db.get(Project, "project-test").owner_id == owner
        assert ADMIN["password"] not in db.get(User, owner).password_hash
        assert raw_client.cookies.get(COOKIE) != db.scalar(select(AuthSession.token_hash))
    assert raw_client.post(PREFIX + "/auth/logout").status_code == 200
    assert raw_client.get(PREFIX + "/projects").status_code == 401


def test_expired_session_and_missing_csrf_header(client, database):
    assert client.post(PREFIX + "/auth/users", json=MEMBER, headers={"X-Persona-Request": ""}).status_code == 403
    with Session(database) as db:
        db.execute(update(AuthSession).values(expires=now() - timedelta(seconds=1))); db.commit()
    assert client.get(PREFIX + "/connections").status_code == 401
    assert client.post(PREFIX + "/projects", json=operation()).status_code == 401


@pytest.mark.parametrize("provider,expected", [("openai", ["gpt-demo-small", "gpt-demo-large"]),
    ("anthropic", ["claude-demo-sonnet", "claude-demo-haiku"]), ("dgx", ["Qwen/demo-8B", "GLM/demo-9B"])])
def test_provider_protocol_encrypted_persistence_and_selection(client, database, model_server, provider, expected):
    base, calls = model_server
    row = register(client, provider, **({"baseUrl": base + "/dgx/v1"} if provider == "dgx" else {}))
    assert row["hasKey"] and row["status"] == "unchecked"
    doc = document()
    doc["model"] = {"connectionId": row["id"], "modelId": expected[0]}
    assert client.post(PREFIX + "/projects", json=operation(doc)).status_code == 422
    checked = client.post(PREFIX + "/connections/" + row["id"] + "/check").json()
    assert checked["status"] == "ready", checked
    assert [m["id"] for m in checked["models"]] == expected
    assert client.post(PREFIX + "/projects", json=operation(doc)).status_code == 201
    # Fresh HTTP session and database session restore the same connection and model selection.
    with TestClient(app, headers={"X-Persona-Request": "1"}) as reopened:
        assert reopened.post(PREFIX + "/auth/login", json={k: ADMIN[k] for k in ("username", "password")}).status_code == 200
        assert reopened.get(PREFIX + "/projects/project-test").json()["model"] == doc["model"]
        payload = reopened.get(PREFIX + "/connections")
        assert payload.json()["connections"] == [checked]
        assert "fake-" not in payload.text and "encrypted" not in payload.text and "apiKey" not in payload.text
    with Session(database) as db:
        ciphertext = db.get(ModelConnection, row["id"]).encrypted_key
        assert "fake-" not in ciphertext
        assert decrypt_key(ciphertext) == "fake-" + provider + "-test"
    assert all("/models" in path for path, _ in calls)
    assert len(calls) == (2 if provider == "anthropic" else 1)
    if provider == "anthropic":
        assert "after_id=claude-demo-sonnet" in calls[-1][0]


def test_permissions_private_shared_projects_and_runs(client, model_server):
    private = register(client)
    shared = register(client, "dgx", scope="shared", baseUrl=model_server[0] + "/dgx/v1")
    client.post(PREFIX + "/connections/" + shared["id"] + "/check")
    _, _, run = create_run(client)
    with member_client(client) as other:
        rows = other.get(PREFIX + "/connections").json()["connections"]
        assert [x["id"] for x in rows] == [shared["id"]] and not rows[0]["canEdit"]
        assert other.post(PREFIX + "/connections/" + private["id"] + "/check").status_code == 404
        assert other.post(PREFIX + "/connections/" + shared["id"] + "/check").status_code == 403
        assert edit(other, shared, name="unauthorized").status_code == 403
        assert other.post(PREFIX + "/auth/users", json=ADMIN).status_code == 403
        assert other.post(PREFIX + "/connections", json=dict(name="공용", provider="dgx", scope="shared", baseUrl=model_server[0] + "/dgx/v1")).status_code == 403
        assert other.get(PREFIX + "/projects").json()["projects"] == []
        for suffix in ("", "/runs"):
            assert other.get(PREFIX + "/projects/project-test" + suffix).status_code == 404
        assert other.put(PREFIX + "/projects/project-test", json=operation(revision=1)).status_code == 404
        for suffix in ("", "/result"):
            assert other.get(PREFIX + "/runs/" + run["id"] + suffix).status_code == 404
        for suffix in ("/retry", "/cancel"):
            assert other.post(PREFIX + "/runs/" + run["id"] + suffix).status_code == 404
        doc = document(); doc["id"] = "member-project"
        doc["model"] = {"connectionId": private["id"], "modelId": "gpt-demo-small"}
        assert other.post(PREFIX + "/projects", json=operation(doc)).status_code == 404
        doc["model"] = {"connectionId": shared["id"], "modelId": "Qwen/demo-8B"}
        assert other.post(PREFIX + "/projects", json=operation(doc)).status_code == 201


def test_update_conflict_key_change_and_redacted_failure(client, model_server, database):
    row = register(client)
    checked = client.post(PREFIX + "/connections/" + row["id"] + "/check").json()
    assert edit(client, row, name="stale").status_code == 409
    renamed = edit(client, checked, name="새 이름").json()
    assert renamed["models"] == checked["models"] and renamed["hasKey"]
    replaced = edit(client, renamed, apiKey="fake-invalid-secret").json()
    assert replaced["models"] == [] and replaced["status"] == "unchecked"
    failed = client.post(PREFIX + "/connections/" + row["id"] + "/check")
    assert failed.json()["status"] == "error"
    assert "fake-invalid-secret" not in failed.text and "API 키" in failed.json()["lastError"]
    invalid = edit(client, failed.json(), apiKey="fake-secret\ninvalid")
    assert invalid.status_code == 422 and "fake-secret" not in invalid.text
    with Session(database) as db:
        assert decrypt_key(db.get(ModelConnection, row["id"]).encrypted_key) == "fake-invalid-secret"


def test_dgx_allowlist_manual_ids_disabled_and_no_redirects(client, model_server):
    base, calls = model_server
    for endpoint in ("http://169.254.169.254/v1", base + "/dgx/v1?key=secret", "http://user:pass@localhost/v1", "http://[bad", base + "/dgx/../v1"):
        result = client.post(PREFIX + "/connections", json=dict(name="bad", provider="dgx", baseUrl=endpoint))
        assert result.status_code == 422, result.text
    assert calls == []
    row = register(client, "dgx", baseUrl=base + "/missing/v1")
    failed = client.post(PREFIX + "/connections/" + row["id"] + "/check").json()
    assert failed["status"] == "error"
    manual = edit(client, failed, manualModelIds=["Qwen/manual-model", "Qwen/manual-model"]).json()
    assert manual["status"] == "manual" and len(manual["models"]) == 1
    doc = document(); doc["model"] = {"connectionId": row["id"], "modelId": "Qwen/manual-model"}
    assert client.post(PREFIX + "/projects", json=operation(doc)).status_code == 201
    disabled = edit(client, manual, enabled=False).json()
    assert client.post(PREFIX + "/connections/" + row["id"] + "/check").status_code == 422
    # Existing disabled selections do not block editing a survey draft.
    doc["name"] = "설문 수정"
    assert client.put(PREFIX + "/projects/project-test", json=operation(doc, 1)).status_code == 200
    doc["id"] = "second-project"
    assert client.post(PREFIX + "/projects", json=operation(doc)).status_code == 422
    redirect = register(client, "dgx", baseUrl=base + "/redirect/v1")
    assert client.post(PREFIX + "/connections/" + redirect["id"] + "/check").json()["status"] == "error"
    assert all(path != "/dgx/v1/models" for path, _ in calls)
    assert disabled["hasKey"]


def test_check_does_not_overwrite_concurrent_edit(client, model_server, database, monkeypatch):
    row = register(client)
    def concurrent(*_args):
        with Session(database) as db:
            db.execute(update(ModelConnection).where(ModelConnection.id == row["id"]).values(revision=2, name="수정됨")); db.commit()
        return [{"id": "gpt-stale-result", "name": "stale", "source": "api"}]
    monkeypatch.setattr("app.connections.discover", concurrent)
    assert client.post(PREFIX + "/connections/" + row["id"] + "/check").status_code == 409
    restored = client.get(PREFIX + "/connections").json()["connections"][0]
    assert restored["name"] == "수정됨" and restored["models"] == []


def test_missing_encryption_config_and_mock_real_key_guard(client, model_server, monkeypatch):
    rejected = client.post(PREFIX + "/connections", json=dict(name="bad", provider="openai", apiKey="sk-not-a-real-key"))
    assert rejected.status_code == 422 and "sk-not-a-real-key" not in rejected.text
    monkeypatch.setattr(settings, "encryption_key", "")
    result = client.post(PREFIX + "/connections", json=dict(name="bad", provider="openai", apiKey="fake-openai-test"))
    assert result.status_code == 503 and "fake-openai-test" not in result.text
    assert client.get(PREFIX + "/connections").json()["connections"] == []


def test_connected_selection_snapshot_still_runs_demo_only(client, database, model_server):
    row = register(client)
    client.post(PREFIX + "/connections/" + row["id"] + "/check")
    doc, _, run = create_run(client)
    drain(database)
    doc["model"] = {"connectionId": row["id"], "modelId": "gpt-demo-small"}
    assert client.put(PREFIX + "/projects/project-test", json=operation(doc, 1)).status_code == 200
    new = client.post(PREFIX + "/projects/project-test/runs", json=dict(expectedRevision=2, requestId="connected-demo", groupId="g1")).json()
    doc["model"]["modelId"] = "gpt-demo-large"
    assert client.put(PREFIX + "/projects/project-test", json=operation(doc, 2)).status_code == 200
    drain(database)
    result = client.get(PREFIX + "/runs/" + new["id"] + "/result").json()
    assert result["status"] == "completed" and result["engine"]["kind"] == "demo" and result["model"] is None
    assert result["engine"]["selectedModel"]["modelId"] == "gpt-demo-small"
    assert len(model_server[1]) == 1  # Model discovery only; worker never invokes a provider.
