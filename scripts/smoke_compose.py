"""Exercise a LOCAL Compose demo over HTTP, before and after container recreation.

prepare: requires a fresh local DB (or this script's previous demo administrator).
verify: re-logins and checks the previously saved state and completed demo run.
Only fake keys and loopback URLs are accepted. No external model calls are made.
"""
import argparse
import hashlib
from http.cookiejar import CookieJar
import json
import os
from pathlib import Path
import secrets
import time
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import build_opener, HTTPCookieProcessor, Request
from uuid import uuid4


class Client:
    def __init__(self, base):
        self.base = base
        self.opener = build_opener(HTTPCookieProcessor(CookieJar()))

    def call(self, path, body=None, method=None, status=200):
        request = Request(self.base + "/api/v1" + path,
                          data=json.dumps(body).encode() if body is not None else None,
                          method=method,
                          headers={"Content-Type": "application/json", "X-Persona-Request": "1", "Origin": self.base})
        try:
            response = self.opener.open(request, timeout=180)
        except HTTPError as error:
            response = error
        payload = json.loads(response.read())
        if response.code != status:
            code = payload.get("error", {}).get("code", "unexpected response")
            raise RuntimeError(f"{path}: expected HTTP {status}, got {response.code} ({code})")
        return payload


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def save_state(path, state):
    path.parent.mkdir(parents=True, exist_ok=True)
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w") as output:
        json.dump(state, output, ensure_ascii=False)


def prepare(client, state_path):
    # Random local credentials are retained only in the ignored smoke state file.
    state = json.loads(state_path.read_text()) if state_path.exists() else {
        "admin": {"username": "compose-admin", "password": secrets.token_urlsafe(24)},
    }
    save_state(state_path, state)
    if client.call("/auth/session")["needsSetup"]:
        client.call("/auth/setup", {**state["admin"], "name": "Docker 검증 관리자"}, status=201)
    else:
        client.call("/auth/login", state["admin"])
    assert client.call("/connections")["mockMode"], "Use compose.local.yaml with fake providers"

    connections = []
    for provider in ("openai", "anthropic", "dgx"):
        body = {"name": f"Docker 시연 {provider}", "provider": provider, "scope": "shared",
                "apiKey": f"fake-{provider}-test"}
        if provider == "dgx":
            body["baseUrl"] = "http://127.0.0.1:8001/dgx/v1"
        connection = client.call("/connections", body, status=201)
        checked = client.call(f'/connections/{connection["id"]}/check', {})
        assert checked["status"] == "ready" and checked["models"]
        assert "apiKey" not in checked and "encrypted_key" not in checked
        connections.append(checked)
    print("PASS: three fake-key providers, model discovery and secret non-disclosure", flush=True)

    catalog = client.call("/persona-dataset")
    filters = {"region": ["서울"], "age": ["30대"], "sex": ["여자"]}
    count = client.call("/persona-dataset/count", {"datasetId": catalog["id"], "filters": filters})
    assert count["count"] >= 10
    project_id = "project-docker-" + uuid4().hex[:12]
    selected = {"connectionId": connections[-1]["id"], "modelId": connections[-1]["models"][0]["id"]}
    document = {
        "id": project_id, "name": "Docker 공용 배포 검증", "description": "원본 추출·DB 복원·시연 실행",
        "survey": {"title": "지역 문화시설 설문", "description": "시연 응답입니다.", "questions": [
            {"id": "q1", "type": "likert", "text": "지역 문화시설 확충에 동의하나요?", "scale": 7,
             "low": "전혀 아니다", "high": "매우 그렇다"},
            {"id": "q2", "type": "text", "parentId": "q1", "text": "그렇게 생각하는 이유는 무엇인가요?"},
        ]},
        "groups": [{"id": "g1", "name": "서울 30대 여성 · 원본 10명", "count": 10,
                    "filters": filters, "cohort": None}],
        "activeGroupId": "g1", "model": selected,
    }
    client.call("/projects", {"document": document, "expectedRevision": 0, "mutationId": str(uuid4())}, status=201)
    cohort = client.call(f"/projects/{project_id}/cohorts", {
        "datasetId": catalog["id"], "groupId": "g1", "expectedRevision": 1, "requestId": str(uuid4())}, status=201)
    assert len(cohort["people"]) == len({p["sourceRecordId"] for p in cohort["people"]}) == 10
    for person in cohort["people"]:
        assert person["attributes"]["uuid"] == person["sourceRecordId"]
        assert all(person["attributes"][key] in values for key, values in filters.items())
    document["groups"][0]["cohort"] = {"id": cohort["id"]}
    saved = client.call(f"/projects/{project_id}", {
        "document": document, "expectedRevision": 1, "mutationId": str(uuid4())}, method="PUT")
    assert saved["groups"][0]["cohort"] == cohort and saved["model"] == selected

    member = {"username": "compose-member-" + uuid4().hex[:8], "password": secrets.token_urlsafe(24)}
    client.call("/auth/users", {**member, "name": "Docker 검증 팀원"}, status=201)
    other = Client(client.base)
    other.call("/auth/login", member)
    other.call(f"/projects/{project_id}", status=404)
    assert not other.call("/projects")["projects"]
    assert any(c["id"] == selected["connectionId"] for c in other.call("/connections")["connections"])
    run = client.call(f"/projects/{project_id}/runs", {
        "expectedRevision": 2, "requestId": str(uuid4()), "groupId": "g1"}, status=202)
    state.update(projectId=project_id, runId=run["id"], cohortDigest=digest(cohort), model=selected,
                 connectionIds=[c["id"] for c in connections], peopleDigest=digest(cohort["people"]),
                 datasetId=catalog["id"], total=catalog["total"], matched=count["count"], base=client.base)
    save_state(state_path, state)
    print(f'PASS: {catalog["total"]:,} source rows, {count["count"]:,} matches, 10 unique records; user isolation', flush=True)
    print(f'Saved project {project_id}; run {run["id"]} ({run["status"]}). Recreate containers, then verify.', flush=True)


def verify(client, state_path):
    state = json.loads(state_path.read_text())
    assert state["base"] == client.base
    client.call("/auth/login", state["admin"])
    project = client.call(f'/projects/{state["projectId"]}')
    assert digest(project["groups"][0]["cohort"]) == state["cohortDigest"]
    assert project["model"] == state["model"]
    for connection_id in state["connectionIds"]:
        assert client.call(f"/connections/{connection_id}/check", {})["status"] == "ready"
    deadline = time.monotonic() + 120
    while True:
        result = client.call(f'/runs/{state["runId"]}/result')
        if result["status"] not in ("queued", "running"):
            break
        if time.monotonic() >= deadline:
            raise RuntimeError("Worker did not complete the queued demo within 120 seconds")
        time.sleep(1)
    assert result["status"] == "completed" and result["engine"]["kind"] == "demo"
    assert len(result["responses"]) == 20
    assert len({(r["personaId"], r["questionId"]) for r in result["responses"]}) == 20
    assert digest(result["people"]) == state["peopleDigest"]
    # A second fresh session models returning in a different browser.
    fresh = Client(client.base)
    fresh.call("/auth/login", state["admin"])
    assert fresh.call(f'/runs/{state["runId"]}/result') == result
    print("PASS: fresh-login restore, immutable cohort, model/key restore, 20 unique demo responses", flush=True)
    print(f'Open: {client.base}/p/{state["projectId"]}/design/target', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("phase", choices=("prepare", "verify"))
    parser.add_argument("--base-url", default="http://127.0.0.1:8080")
    parser.add_argument("--state", type=Path, default=Path(".runtime/compose-smoke.json"))
    args = parser.parse_args()
    parsed = urlsplit(args.base_url)
    if parsed.scheme != "http" or parsed.hostname not in ("localhost", "127.0.0.1") or parsed.path or parsed.query or parsed.fragment or parsed.username:
        parser.error("Smoke verification only accepts a plain loopback HTTP origin")
    client = Client(args.base_url)
    client.call("/health")
    (prepare if args.phase == "prepare" else verify)(client, args.state)


if __name__ == "__main__":
    main()
