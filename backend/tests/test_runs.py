import copy
import os
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from uuid import uuid4

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from app.models import Response, RunTask
from app.runs import now
from app.worker import claim, demo_answer, process, save_answer
from test_projects import document, operation


def create(client, fail=False):
    doc = document()
    doc["groups"][0]["cohort"]["people"] = [{"id": f"P-{i:03}", "attributes": {"age": "20대", "sex": "여자"}} for i in range(10)]
    q = copy.deepcopy(doc["survey"]["questions"][0])
    q.update(id="q3", type="text", text="추가 의견은?")
    doc["survey"]["questions"].append(q)
    assert client.post("/api/v1/projects", json=operation(doc)).status_code == 201
    body = dict(expectedRevision=1, requestId=str(uuid4()), groupId="g1", failNext=fail)
    response = client.post("/api/v1/projects/project-test/runs", json=body)
    assert response.status_code == 202, response.text
    return doc, body, response.json()


def drain(database):
    while job := claim(database):
        process(database, job, delay=0)


def test_snapshot_is_independent_of_later_edit_and_group_deletion(client, database):
    doc, body, run = create(client)
    frozen = client.get(f'/api/v1/runs/{run["id"]}/result').json()
    doc["survey"]["questions"][0]["scale"] = 3
    doc["survey"]["title"] = "변경한 설문"
    doc["groups"][0].update(id="g2", name="새 집단", filters={}, cohort=None)
    doc["activeGroupId"] = "g2"
    assert client.put("/api/v1/projects/project-test", json=operation(doc, 1)).status_code == 200
    drain(database)
    result = client.get(f'/api/v1/runs/{run["id"]}/result').json()
    assert result["status"] == "completed"
    for key in ("survey", "people", "groupConfig", "groupName", "engine"):
        assert result[key] == frozen[key]
    assert len(result["responses"]) == result["total"] == 30
    assert result["model"] is None
    assert result["engine"]["kind"] == "demo"
    assert all(a["answer"] is None if a["questionId"] == "q3" else 0 <= a["answer"] < (7 if a["questionId"] == "q1" else 3) for a in result["responses"])


def test_retry_preserves_successful_answers_and_completes_only_remaining_work(client, database):
    _, _, run = create(client, fail=True)
    drain(database)
    partial = client.get(f'/api/v1/runs/{run["id"]}/result').json()
    assert partial["status"] == "partial_failed"
    assert partial["succeeded"] == 28 and partial["failed"] == 2
    assert partial["progress"] == 100
    assert client.post(f'/api/v1/runs/{run["id"]}/retry').status_code == 202
    resumed = claim(database)
    assert resumed["index"] == 1
    process(database, resumed, delay=0)
    result = client.get(f'/api/v1/runs/{run["id"]}/result').json()
    assert result["status"] == "completed" and result["failed"] == 0
    assert all(item in result["responses"] for item in partial["responses"])
    assert len(result["responses"]) == 30


def test_expired_lease_fences_old_worker_and_resumes_checkpoint(client, database):
    _, _, run = create(client)
    old = claim(database)
    answer = demo_answer(old, old["survey"]["questions"][0])
    assert save_answer(database, old, 0, answer)
    with Session(database) as session, session.begin():
        task = session.get(RunTask, (old["run_id"], old["persona_id"]))
        task.lease_until = now() - timedelta(seconds=1)
    resumed = claim(database)
    assert resumed["persona_id"] == old["persona_id"] and resumed["index"] == 1
    assert resumed["token"] != old["token"]
    assert not save_answer(database, old, 1, demo_answer(old, old["survey"]["questions"][1]))
    old["prior"]["q1"] = answer
    assert demo_answer(old, old["survey"]["questions"][1]) == demo_answer(resumed, resumed["survey"]["questions"][1])
    process(database, resumed, delay=0)
    drain(database)
    result = client.get(f'/api/v1/runs/{run["id"]}/result').json()
    assert result["succeeded"] == 30
    assert len({(r["personaId"], r["questionId"]) for r in result["responses"]}) == 30


def test_multiple_workers_do_not_claim_or_write_same_job(client, database):
    _, _, run = create(client)
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(lambda _: drain(database), range(4)))
    drain(database)
    result = client.get(f'/api/v1/runs/{run["id"]}/result').json()
    assert result["status"] == "completed" and len(result["responses"]) == 30


def test_cancel_invalidates_inflight_job_and_keeps_answers(client, database):
    _, _, run = create(client)
    job = claim(database)
    assert save_answer(database, job, 0, demo_answer(job, job["survey"]["questions"][0]))
    assert client.post(f'/api/v1/runs/{run["id"]}/cancel').json()["status"] == "cancelled"
    assert not save_answer(database, job, 1, demo_answer(job, job["survey"]["questions"][1]))
    assert claim(database) is None
    assert len(client.get(f'/api/v1/runs/{run["id"]}/result').json()["responses"]) == 1


def test_run_idempotency_revision_and_one_active_project(client, database):
    _, body, run = create(client)
    assert client.post("/api/v1/projects/project-test/runs", json=body).json()["id"] == run["id"]
    changed = {**body, "failNext": True}
    assert client.post("/api/v1/projects/project-test/runs", json=changed).status_code == 409
    body["requestId"] = str(uuid4())
    assert client.post("/api/v1/projects/project-test/runs", json=body).json()["error"]["code"] == "RUN_ACTIVE"
    drain(database)
    body["expectedRevision"] = 99
    assert client.post("/api/v1/projects/project-test/runs", json=body).json()["error"]["code"] == "REVISION_CONFLICT"


def test_survey_version_reuse_and_server_owned_history(client, database):
    doc, body, run = create(client)
    drain(database)
    body["requestId"] = str(uuid4())
    second = client.post("/api/v1/projects/project-test/runs", json=body).json()
    assert second["survey"]["version"] == 1
    drain(database)
    doc["survey"].update(title="다음 설문", version=900, history=[])
    assert client.put("/api/v1/projects/project-test", json=operation(doc, 1)).status_code == 200
    body.update(expectedRevision=2, requestId=str(uuid4()))
    third = client.post("/api/v1/projects/project-test/runs", json=body).json()
    assert third["survey"]["version"] == 2
    project = client.get("/api/v1/projects/project-test").json()
    assert project["survey"]["version"] == 2 and len(project["survey"]["history"]) == 2
    assert project["survey"]["draft"] is False


def test_db_rejects_snapshot_mutation(client, database):
    _, _, run = create(client)
    with pytest.raises(DBAPIError), database.begin() as connection:
        connection.execute(text("UPDATE runs SET group_snapshot='{}'::jsonb WHERE id=:id"), {"id": run["id"]})
    with pytest.raises(DBAPIError), database.begin() as connection:
        connection.execute(text("UPDATE survey_versions SET version=100"))


def test_invalid_draft_or_stale_cohort_never_queues(client):
    doc = document()  # count=10 but only one person: rejected at execution
    client.post("/api/v1/projects", json=operation(doc))
    body = dict(expectedRevision=1, requestId=str(uuid4()), groupId="g1")
    assert client.post("/api/v1/projects/project-test/runs", json=body).json()["error"]["code"] == "COHORT_STALE"
    doc["survey"]["title"] = ""
    client.put("/api/v1/projects/project-test", json=operation(doc, 1))
    body["expectedRevision"] = 2
    assert client.post("/api/v1/projects/project-test/runs", json=body).json()["error"]["code"] == "INVALID_SURVEY"
    assert client.get("/api/v1/projects/project-test/runs").json()["runs"] == []


def wait_until(predicate, seconds=12):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        if predicate():
            return
        time.sleep(0.05)
    raise AssertionError("Worker did not reach expected state before timeout")


def test_real_worker_process_restart_recovers_without_a_browser(client, database):
    _, _, run = create(client)
    with database.connect() as connection:
        schema = connection.scalar(text("SELECT current_schema()"))
    url = database.url.update_query_dict({"options": f"-csearch_path={schema}"}).render_as_string(hide_password=False)
    env = {**os.environ, "PERSONA_DATABASE_URL": url}
    command = [sys.executable, "-m", "app.worker", "--concurrency", "1", "--demo-delay", "0.1", "--lease-seconds", "2"]
    worker = subprocess.Popen(command, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        wait_until(lambda: client.get(f'/api/v1/runs/{run["id"]}').json()["succeeded"] >= 1)
        worker.kill()
        worker.wait(timeout=5)
        before = client.get(f'/api/v1/runs/{run["id"]}/result').json()["responses"]
        worker = subprocess.Popen(command, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        wait_until(lambda: client.get(f'/api/v1/runs/{run["id"]}').json()["status"] == "completed")
        after = client.get(f'/api/v1/runs/{run["id"]}/result').json()["responses"]
        assert len(after) == 30 and all(item in after for item in before)
    finally:
        if worker.poll() is None:
            worker.terminate()
            worker.wait(timeout=5)
