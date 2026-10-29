from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from uuid import uuid4

from sqlalchemy import inspect, text


def document():
    return {
        "id": "project-test", "name": "DDP 설문", "description": "저장 검증",
        "survey": {"title": "정책 설문", "description": "", "version": 0, "draft": True, "history": [], "questions": [
            {"id": "q1", "type": "likert", "parentId": None, "text": "동의하나요?", "options": [], "otherEnabled": False, "scale": 7, "low": "전혀 아니다", "high": "매우 그렇다"},
            {"id": "q2", "type": "choice", "parentId": "q1", "text": "이유는?", "options": ["비용", "문화"], "otherEnabled": True, "scale": 5, "low": "", "high": ""},
        ]},
        "groups": [{"id": "g1", "name": "수도권", "count": 10, "filters": {"region": ["서울"], "age": ["20대"]}, "cohort": {
            "builtFrom": '{"count":10,"filters":{"region":["서울"],"age":["20대"]}}',
            "created": "2026-10-23T00:00:00Z", "textFiltersIgnored": [],
            "people": [{"id": "P-001", "attributes": {"sex": "여자", "openness": '{"t_score":50,"label":"보통"}'}}],
        }}],
        "activeGroupId": "g1", "model": {"id": "qwen"},
    }


def operation(doc=None, revision=0, mutation=None):
    return {"document": doc or document(), "expectedRevision": revision, "mutationId": mutation or str(uuid4())}


def test_roundtrip_and_database_rows(client, database):
    doc = document()
    created = client.post("/api/v1/projects", json=operation(doc))
    assert created.status_code == 201, created.text
    result = client.get("/api/v1/projects/project-test").json()
    assert {key: result[key] for key in doc} == doc
    assert result["revision"] == 1
    assert client.get("/api/v1/projects").json()["projects"] == [result]
    # Read through a separate DB connection, independently of the HTTP session.
    with database.connect() as db:
        assert db.scalar(text("SELECT survey->>'title' FROM projects")) == "정책 설문"
        assert db.scalar(text("SELECT count FROM target_groups")) == 10
    assert set(inspect(database).get_table_names()) == {"projects", "target_groups", "alembic_version", "survey_versions", "runs", "run_tasks", "responses", "users", "auth_sessions", "model_connections", "persona_datasets", "persona_cohorts", "inference_attempts", "interview_turns"}


def test_incomplete_drafts_are_saved(client):
    doc = document()
    doc["survey"]["title"] = ""
    doc["survey"]["questions"][0]["text"] = ""
    doc["survey"]["questions"][1]["options"] = [""]
    doc["groups"][0]["count"] = None
    result = client.post("/api/v1/projects", json=operation(doc))
    assert result.status_code == 201
    assert result.json()["groups"][0]["count"] is None
    doc["groups"][0]["count"] = 0
    assert client.put("/api/v1/projects/project-test", json=operation(doc, 1)).status_code == 200


def test_add_reorder_delete_groups_and_active_selection_are_atomic(client, database):
    doc = document()
    client.post("/api/v1/projects", json=operation(doc))
    second = {**deepcopy(doc["groups"][0]), "id": "g2", "name": "복제한 집단", "cohort": None}
    doc["groups"].insert(0, second)
    doc["activeGroupId"] = "g2"
    assert client.put("/api/v1/projects/project-test", json=operation(doc, 1)).status_code == 200
    loaded = client.get("/api/v1/projects/project-test").json()
    assert [g["id"] for g in loaded["groups"]] == ["g2", "g1"]
    doc["groups"] = [second]
    assert client.put("/api/v1/projects/project-test", json=operation(doc, 2)).status_code == 200
    with database.connect() as db:
        assert db.scalar(text("SELECT count(*) FROM target_groups")) == 1
    doc["groups"] = []
    assert client.put("/api/v1/projects/project-test", json=operation(doc, 3)).status_code == 422
    assert client.get("/api/v1/projects/project-test").json()["revision"] == 3


def test_old_revision_cannot_overwrite_newer_edits(client):
    doc = document()
    client.post("/api/v1/projects", json=operation(doc))
    doc["survey"]["title"] = "최신 제목"
    assert client.put("/api/v1/projects/project-test", json=operation(doc, 1)).status_code == 200
    stale = client.put("/api/v1/projects/project-test", json=operation(document(), 1))
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "REVISION_CONFLICT"
    assert client.get("/api/v1/projects/project-test").json()["survey"]["title"] == "최신 제목"


def test_concurrent_writers_only_one_commits(client):
    client.post("/api/v1/projects", json=operation())
    def write(title):
        doc = document()
        doc["survey"]["title"] = title
        return client.put("/api/v1/projects/project-test", json=operation(doc, 1)).status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = list(pool.map(write, ["탭 A", "탭 B"]))
    assert sorted(statuses) == [200, 409]
    assert client.get("/api/v1/projects/project-test").json()["revision"] == 2


def test_response_lost_retry_is_idempotent(client):
    first = operation()
    assert client.post("/api/v1/projects", json=first).status_code == 201
    assert client.post("/api/v1/projects", json=first).json()["revision"] == 1
    edited = operation(revision=1)
    assert client.put("/api/v1/projects/project-test", json=edited).json()["revision"] == 2
    assert client.put("/api/v1/projects/project-test", json=edited).json()["revision"] == 2
    edited["document"]["name"] = "같은 ID로 다른 내용"
    assert client.put("/api/v1/projects/project-test", json=edited).json()["error"]["code"] == "MUTATION_REUSED"


def test_bad_references_and_unknown_secret_fields_rejected(client):
    doc = document()
    doc["survey"]["questions"][1]["parentId"] = "missing"
    assert client.post("/api/v1/projects", json=operation(doc)).status_code == 422
    doc = document()
    doc["activeGroupId"] = "missing"
    assert client.post("/api/v1/projects", json=operation(doc)).status_code == 422
    doc = document()
    doc["model"]["apiKey"] = "secret-never-echo"
    result = client.post("/api/v1/projects", json=operation(doc))
    assert result.status_code == 422
    assert "secret-never-echo" not in result.text
    assert client.get("/api/v1/projects").json()["projects"] == []


def test_project_id_mismatch_and_missing_project(client):
    assert client.get("/api/v1/projects/missing").status_code == 404
    assert client.put("/api/v1/projects/wrong", json=operation(revision=1)).status_code == 422
    assert client.put("/api/v1/projects/project-test", json=operation(revision=1)).status_code == 404


def test_other_project_survives_new_example(client):
    client.post("/api/v1/projects", json=operation())
    example = document()
    example["id"] = "example-project"
    client.post("/api/v1/projects", json=operation(example))
    assert len(client.get("/api/v1/projects").json()["projects"]) == 2
