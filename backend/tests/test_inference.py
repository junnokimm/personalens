import json
import threading
import time
from datetime import timedelta
from http.server import ThreadingHTTPServer
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.inference import InferenceError, parse_response, request_body
from app.main import app
from app.mock_provider import Handler
from app.models import InferenceAttempt, ModelConnection, RunTask
from app.runs import now
from app.worker import claim, process, reserve_attempt
from app.providers import discover
from app.errors import ApiError
from test_connections import ADMIN, model_server, register, member_client
from test_projects import document, operation
from test_runs import drain


@pytest.fixture
def inference(client, monkeypatch, model_server):
    monkeypatch.setattr(settings, "openai_inference_enabled", True)
    row = register(client)
    checked = client.post(f'/api/v1/connections/{row["id"]}/check').json()
    assert checked["inferenceReady"]
    doc = document()
    doc["model"] = {"connectionId": row["id"], "modelId": "gpt-demo-small"}
    doc["groups"][0]["cohort"]["people"] = [{"id": f"P-{i:03}", "attributes": {"age": "20대", "sex": "여자", "uuid": str(uuid4())}} for i in range(10)]
    doc["survey"]["questions"][1].update(type="text", text="그 이유는 무엇인가요?")
    assert client.post("/api/v1/projects", json=operation(doc)).status_code == 201
    body = dict(expectedRevision=1, requestId=str(uuid4()), groupId="g1", engine="openai", selection=doc["model"])
    return doc, body, row


def start(client, body):
    response = client.post('/api/v1/projects/project-test/runs', json=body)
    assert response.status_code == 202, response.text
    return response.json()


def test_ten_people_snapshot_usage_and_fresh_login_restore(client, database, inference):
    doc, body, _ = inference
    run = start(client, body)
    assert start(client, body)["id"] == run["id"]
    job = claim(database)
    prompt = request_body(job, job["survey"]["questions"][0])
    assert prompt["store"] is False and prompt["text"]["format"]["strict"] is True
    assert 'uuid' not in json.loads(prompt['input'][0]['content'])['persona']
    assert 'fake-' not in json.dumps(run)
    doc["survey"]["title"] = "실행 후 수정한 설문"
    doc["model"] = None
    assert client.put('/api/v1/projects/project-test', json=operation(doc, 1)).status_code == 200
    process(database, job)
    drain(database)
    with TestClient(app, headers={"X-Persona-Request": "1"}) as fresh:
        assert fresh.post('/api/v1/auth/login', json={k: ADMIN[k] for k in ('username', 'password')}).status_code == 200
        result = fresh.get(f'/api/v1/runs/{run["id"]}/result').json()
        assert result['status'] == 'completed' and len(result['responses']) == result['total'] == 20
        assert result['engine'] == run['engine'] and result['survey']['title'] != doc['survey']['title']
        assert result['usage'] == dict(attempts=20, inputTokens=2000, outputTokens=500, unknownAttempts=0)
        assert len({(r['personaId'], r['questionId']) for r in result['responses']}) == 20
        assert fresh.get(f'/api/v1/runs/{run["id"]}/result').json() == result
    with member_client(client) as other:
        assert other.get(f'/api/v1/runs/{run["id"]}/result').status_code == 404


def test_start_validates_mode_selection_limits_and_access(client, database, inference, monkeypatch):
    doc, body, row = inference
    for change, expected in [({'selection': None}, 'MODEL_SELECTION_CHANGED'), ({'failNext': True}, 'DEMO_ONLY_OPTION')]:
        assert client.post('/api/v1/projects/project-test/runs', json={**body, **change}).json()['error']['code'] == expected
    monkeypatch.setattr(settings, 'openai_max_responses', 19)
    assert client.post('/api/v1/projects/project-test/runs', json=body).json()['error']['code'] == 'INFERENCE_RUN_LIMIT'
    monkeypatch.setattr(settings, 'openai_max_responses', 100)
    monkeypatch.setattr(settings, 'openai_inference_enabled', False)
    assert client.post('/api/v1/projects/project-test/runs', json=body).json()['error']['code'] == 'INFERENCE_DISABLED'
    monkeypatch.setattr(settings, 'openai_inference_enabled', True)
    with Session(database) as db:
        db.get(ModelConnection, row['id']).enabled = False
        db.commit()
    assert client.post('/api/v1/projects/project-test/runs', json=body).json()['error']['code'] == 'OPENAI_NOT_READY'


def test_failure_no_demo_fallback_and_bounded_manual_retry(client, database, inference, monkeypatch):
    _, body, _ = inference
    run = start(client, body)
    def reject(*args):
        raise InferenceError('OPENAI_AUTH', '키를 확인하세요.')
    monkeypatch.setattr('app.worker.generate', reject)
    for index in range(4):
        drain(database)
        result = client.get(f'/api/v1/runs/{run["id"]}/result').json()
        assert result['status'] == 'failed' and result['responses'] == []
        assert result['usage']['attempts'] == min(index + 1, 3) * 10
        if index < 3:
            assert client.post(f'/api/v1/runs/{run["id"]}/retry').status_code == 202
    assert '최대 호출 횟수' in result['failNote']


def test_long_request_heartbeat_prevents_duplicate_and_cancel_discards(client, database, inference, monkeypatch):
    _, body, _ = inference
    run = start(client, body)
    entered, release = threading.Event(), threading.Event()
    def slow(*args):
        entered.set()
        assert release.wait(5)
        return {'personaId': args[2]['persona_id'], 'questionId': args[3]['id'], 'answer': 2, 'text': '', 'otherText': ''}, {'input_tokens': 9, 'output_tokens': 4}
    monkeypatch.setattr('app.worker.generate', slow)
    job = claim(database, lease_seconds=0.3)
    thread = threading.Thread(target=process, args=(database, job), kwargs={'lease_seconds': 0.3})
    thread.start()
    try:
        assert entered.wait(3)
        time.sleep(0.7)
        other = claim(database)
        assert other['persona_id'] != job['persona_id']
        assert client.post(f'/api/v1/runs/{run["id"]}/cancel').status_code == 202
    finally:
        release.set(); thread.join(5)
    result = client.get(f'/api/v1/runs/{run["id"]}/result').json()
    assert result['status'] == 'cancelled' and result['responses'] == []
    assert result['usage']['inputTokens'] == 9


def test_interrupted_request_requires_explicit_retry(client, database, inference):
    _, body, _ = inference
    run = start(client, body)
    job = claim(database)
    reserve_attempt(database, job, job['survey']['questions'][0])
    with Session(database) as db:
        db.get(RunTask, (run['id'], job['persona_id'])).lease_until = now() - timedelta(seconds=1)
        db.commit()
    drain(database)
    result = client.get(f'/api/v1/runs/{run["id"]}/result').json()
    assert result['status'] == 'partial_failed' and len(result['responses']) == 18
    assert result['usage']['unknownAttempts'] == 1
    assert client.post(f'/api/v1/runs/{run["id"]}/retry').status_code == 202
    drain(database)
    assert len(client.get(f'/api/v1/runs/{run["id"]}/result').json()['responses']) == 20


def test_worker_rechecks_disabled_connection_before_call(client, database, inference, monkeypatch):
    _, body, row = inference
    run = start(client, body)
    with Session(database) as db:
        db.get(ModelConnection, row['id']).enabled = False; db.commit()
    def forbidden(*args):
        pytest.fail('A disabled connection must not make a model call')
    monkeypatch.setattr('app.worker.generate', forbidden)
    drain(database)
    result = client.get(f'/api/v1/runs/{run["id"]}/result').json()
    assert result['status'] == 'failed' and result['usage']['attempts'] == 0


@pytest.mark.parametrize('value', [True, -1, 7, '2', None])
def test_invalid_index_is_never_saved(value):
    question = document()['survey']['questions'][0]
    body = {'status': 'completed', 'output': [{'type': 'message', 'content': [{'type': 'output_text',
        'text': json.dumps({'answer': value, 'text': '', 'otherText': ''})}]}]}
    with pytest.raises(InferenceError, match='형식'):
        parse_response(body, question, 'P-001')


@pytest.mark.parametrize('body', [
    {'status': 'incomplete', 'usage': {'input_tokens': 5, 'output_tokens': 4}},
    {'status': 'completed', 'output': [{'type': 'message', 'content': [{'type': 'refusal', 'refusal': 'not shown'}]}]},
])
def test_incomplete_and_refusal_fail(body):
    with pytest.raises(InferenceError):
        parse_response(body, document()['survey']['questions'][0], 'P-001')


@pytest.mark.parametrize('http_status,recover,attempts', [(401, False, 1), (302, False, 1), (400, False, 1), (429, True, 3), (503, True, 3)])
def test_http_errors_are_redacted_and_retries_bounded(client, database, inference, monkeypatch, http_status, recover, attempts):
    _, body, row = inference
    calls = []
    class Fault(Handler):
        def do_POST(self):
            calls.append(self.path)
            assert self.headers['Authorization'] == 'Bearer fake-openai-test'
            if len(calls) > 1 and recover:
                return super().do_POST()
            self.send_response(http_status)
            self.send_header('Location', 'https://example.invalid/leak')
            self.end_headers()
            self.wfile.write(b'fake-sensitive-provider-error')
    server = ThreadingHTTPServer(('127.0.0.1', 0), Fault)
    thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
    base = f'http://127.0.0.1:{server.server_port}'
    monkeypatch.setattr(settings, 'mock_provider_base_url', base)
    with Session(database) as db:
        db.get(ModelConnection, row['id']).base_url = base + '/openai/v1'; db.commit()
    try:
        run = start(client, body)
        job = claim(database)
        process(database, job)
        result = client.get(f'/api/v1/runs/{run["id"]}/result').json()
        assert len(calls) == attempts
        assert set(calls) == {'/openai/v1/responses'}
        assert len(result['responses']) == (2 if recover else 0)
        assert 'fake-sensitive' not in json.dumps(result)
        assert client.post(f'/api/v1/runs/{run["id"]}/cancel').status_code == 202
    finally:
        server.shutdown(); server.server_close(); thread.join()


def test_fake_keys_never_go_to_official_api(monkeypatch):
    monkeypatch.setattr(settings, 'mock_provider_base_url', '')
    def forbidden(*args):
        pytest.fail('Fake credentials must not be sent to OpenAI')
    monkeypatch.setattr('app.providers.fetch_json', forbidden)
    with pytest.raises(ApiError) as error:
        discover('openai', 'https://api.openai.com/v1', 'fake-openai-test')
    assert error.value.code == 'REAL_KEY_REQUIRED'
