import copy
import json
from uuid import uuid4
from concurrent.futures import ThreadPoolExecutor

import duckdb
import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app.config import settings
from app.persona_data import dataset
from test_projects import document, operation
from test_runs import drain


@pytest.fixture
def parquet(tmp_path, monkeypatch):
    path = tmp_path / "people.parquet"
    with duckdb.connect() as c:
        c.sql("""
            SELECT 'uuid-' || i::VARCHAR AS uuid, (30 + i % 10)::BIGINT AS age,
                CASE WHEN i < 40 THEN '서울' ELSE '부산' END AS region,
                CASE WHEN i < 40 THEN '서울-은평구' ELSE '부산-동구' END AS district,
                CASE WHEN i % 2 = 0 THEN '여자' ELSE '남자' END AS sex,
                '실제 직업 ' || i::VARCHAR AS occupation,
                '{"t_score":50,"label":"보통","description":"원본 성격"}' AS openness,
                CASE WHEN i % 4 = 0 THEN '여행 Walking 100%_' ELSE '독서' END AS hobbies_and_interests,
                '원본 상세 프로필 ' || i::VARCHAR AS detailed_persona
            FROM range(60) AS t(i)
        """).write_parquet(str(path))
    monkeypatch.setattr(settings, "parquet_path", str(path))
    return path


def prepare(client):
    doc = document()
    doc["groups"][0].update(filters={"region": ["서울"], "age": ["30대"], "sex": ["여자"]}, cohort=None)
    assert client.post("/api/v1/projects", json=operation(doc)).status_code == 201
    catalog = client.get("/api/v1/persona-dataset")
    assert catalog.status_code == 200, catalog.text
    body = dict(datasetId=catalog.json()["id"], groupId="g1", expectedRevision=1, requestId=str(uuid4()))
    return doc, body


def test_exact_count_and_filter_semantics(client, parquet):
    schema = client.get("/api/v1/persona-dataset").json()
    assert schema["total"] == 60
    assert next(f for f in schema["fields"] if f["key"] == "age")["options"] == [
        {"value": "30대", "label": "30대", "count": 60}]
    def count(filters):
        return client.post("/api/v1/persona-dataset/count", json=dict(datasetId=schema["id"], filters=filters))
    assert count({"region": ["서울", "서울::서울-은평구"], "sex": ["여자"]}).json()["count"] == 20
    assert count({"region": ["서울", "부산"], "sex": ["여자", "남자"]}).json()["count"] == 60
    assert count({"region": ["서울"], "hobbies_and_interests": ["walking"]}).json()["count"] == 10
    assert count({"hobbies_and_interests": ["%_"]}).json()["count"] == 15  # literal, not SQL wildcards
    assert count({"hobbies_and_interests": ["' OR 1=1 --"]}).json()["count"] == 0
    assert count({"openness": [json.dumps({"t_score": 50})]}).json()["count"] == 60
    assert count({"unknown": ["x"]}).status_code == 422
    assert count({"region": ["missing"]}).status_code == 422
    assert count({"age": ["999대"]}).status_code == 422
    assert count({"hobbies_and_interests": [" "]}).status_code == 422


def test_real_rows_persist_restore_and_demo_run_stays_demo(client, database, parquet):
    doc, body = prepare(client)
    response = client.post("/api/v1/projects/project-test/cohorts", json=body)
    assert response.status_code == 201, response.text
    cohort = response.json()
    assert len(cohort["people"]) == len({p["sourceRecordId"] for p in cohort["people"]}) == 10
    assert cohort["source"]["matched"] == 20
    with duckdb.connect() as c:
        originals = {r[0]: r[1:] for r in c.execute(
            "SELECT uuid, age, occupation, detailed_persona FROM read_parquet(?)", [str(parquet)]).fetchall()}
    for p in cohort["people"]:
        age, occupation, story = originals[p["sourceRecordId"]]
        assert p["attributes"]["age"] == "30대"
        assert p["attributes"]["ageYears"] == age
        assert p["attributes"]["occupation"] == occupation
        assert p["attributes"]["detailed_persona"] == story
    assert client.post("/api/v1/projects/project-test/cohorts", json=body).json() == cohort
    assert client.get("/api/v1/projects/project-test").json()["revision"] == 1
    # The browser attaches only an immutable reference.
    doc["groups"][0]["cohort"] = {"id": cohort["id"]}
    saved = client.put("/api/v1/projects/project-test", json=operation(doc, 1))
    assert saved.status_code == 200, saved.text
    assert saved.json()["groups"][0]["cohort"] == cohort
    assert client.get("/api/v1/projects").json()["projects"][0]["groups"][0]["cohort"] == cohort
    with database.connect() as c:
        assert c.scalar(text("SELECT payload FROM persona_cohorts")) == cohort
    started = client.post("/api/v1/projects/project-test/runs", json={
        "expectedRevision": 2, "requestId": str(uuid4()), "groupId": "g1"})
    assert started.status_code == 202, started.text
    drain(database)
    run = client.get("/api/v1/runs/" + started.json()["id"] + "/result").json()
    assert run["status"] == "completed" and run["engine"]["kind"] == "demo"
    assert run["people"] == cohort["people"]
    # Existing snapshots survive a missing original file and changed draft.
    parquet.unlink()
    assert client.get("/api/v1/projects/project-test").json()["groups"][0]["cohort"] == cohort
    doc["groups"][0]["filters"] = {"sex": ["남자"]}
    assert client.put("/api/v1/projects/project-test", json=operation(doc, 2)).status_code == 200
    assert client.get("/api/v1/runs/" + run["id"] + "/result").json()["people"] == cohort["people"]
    assert client.post("/api/v1/projects/project-test/runs", json={
        "expectedRevision": 3, "requestId": str(uuid4()), "groupId": "g1"}).status_code == 422
    with pytest.raises(DBAPIError), database.begin() as c:
        c.execute(text("UPDATE persona_cohorts SET payload='{}'"))


def test_cannot_forge_or_borrow_a_cohort(client, parquet):
    doc, body = prepare(client)
    cohort = client.post("/api/v1/projects/project-test/cohorts", json=body).json()
    tampered = copy.deepcopy(cohort)
    tampered["people"][0]["attributes"]["age"] = "90대"
    doc["groups"][0]["cohort"] = tampered
    response = client.put("/api/v1/projects/project-test", json=operation(doc, 1))
    assert response.json()["groups"][0]["cohort"] == cohort
    other = copy.deepcopy(doc)
    other["id"] = "other"
    other["groups"][0]["cohort"] = None
    assert client.post("/api/v1/projects", json=operation(other)).status_code == 201
    other["groups"][0]["cohort"] = {"id": cohort["id"]}
    assert client.put("/api/v1/projects/other", json=operation(other, 1)).status_code == 422
    assert client.get("/api/v1/projects/other/cohorts/" + cohort["id"]).status_code == 422
    tampered.pop("id")
    doc["groups"][0]["cohort"] = tampered
    assert client.put("/api/v1/projects/project-test", json=operation(doc, 2)).status_code == 422


def test_insufficient_version_conflict_and_source_validation(client, parquet, monkeypatch):
    doc, body = prepare(client)
    changed = copy.deepcopy(body)
    changed["datasetId"] = "old-version"
    assert client.post("/api/v1/projects/project-test/cohorts", json=changed).status_code == 409
    doc["groups"][0]["count"] = 21
    assert client.put("/api/v1/projects/project-test", json=operation(doc, 1)).status_code == 200
    assert client.post("/api/v1/projects/project-test/cohorts", json=body).status_code == 409
    body["expectedRevision"] = 2
    assert client.post("/api/v1/projects/project-test/cohorts", json=body).json()["error"]["code"] == "INSUFFICIENT_PERSONAS"
    monkeypatch.setattr(settings, "parquet_path", "")
    assert client.get("/api/v1/persona-dataset").status_code == 503


def test_duplicate_source_uuid_rejected(parquet):
    with duckdb.connect() as c:
        c.sql("SELECT 'same' AS uuid, 30 AS age, '서울' AS region, '서울-은평구' AS district FROM range(2)").write_parquet(str(parquet))
    from app.errors import ApiError
    with pytest.raises(ApiError) as error:
        dataset()
    assert error.value.code == "INVALID_DATASET"


def test_seed_is_reproducible_and_records_stay_intact(parquet):
    source = dataset()
    first, n = source.sample({}, 10, "seed-one")
    again, _ = source.sample({}, 10, "seed-one")
    other, _ = source.sample({}, 10, "seed-two")
    assert first == again and first != other and n == 60
    assert all(p["attributes"]["uuid"] == p["sourceRecordId"] for p in first)


def test_edit_during_extraction_does_not_attach_stale_results(client, database, parquet, monkeypatch):
    _, body = prepare(client)
    source = dataset()
    original = source.sample
    def slow_sample(*args):
        result = original(*args)
        with database.begin() as db:
            db.execute(text("UPDATE projects SET revision=revision+1 WHERE id='project-test'"))
        return result
    monkeypatch.setattr(source, "sample", slow_sample)
    response = client.post("/api/v1/projects/project-test/cohorts", json=body)
    assert response.status_code == 409
    with database.connect() as db:
        assert db.scalar(text("SELECT count(*) FROM persona_cohorts")) == 0


def test_concurrent_retries_return_the_same_cohort(client, database, parquet):
    _, body = prepare(client)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: client.post("/api/v1/projects/project-test/cohorts", json=body), range(2)))
    assert all(r.status_code == 201 for r in results)
    assert results[0].json() == results[1].json()
    with database.connect() as db:
        assert db.scalar(text("SELECT count(*) FROM persona_cohorts")) == 1


def test_other_user_cannot_read_or_build_the_project_cohort(client, parquet):
    _, body = prepare(client)
    cohort = client.post("/api/v1/projects/project-test/cohorts", json=body).json()
    member = {"username": "parquet-member", "name": "검증 팀원", "password": "fake-password-123"}
    assert client.post("/api/v1/auth/users", json=member).status_code == 201
    client.post("/api/v1/auth/logout")
    client.headers.pop("X-Persona-User")
    assert client.post("/api/v1/auth/login", json={k: member[k] for k in ("username", "password")}).status_code == 200
    assert client.get("/api/v1/projects/project-test/cohorts/" + cohort["id"]).status_code == 404
    assert client.post("/api/v1/projects/project-test/cohorts", json=body).status_code == 404
