import copy
import json
import threading
import time
from datetime import timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.inference import InferenceError
from app.main import app
from app.models import Response, Run, RunTrend
from app.runs import now
from app.trends import claim_trend, collect_source, generate_summary, parse_summary, process_trend, summary_body
from test_connections import ADMIN, member_client, model_server
from test_inference import inference, start
from test_projects import operation
from test_runs import create, drain


def route(run):
    return f'/api/v1/runs/{run["id"]}/trend'


def finish(client, database, inference):
    run = start(client, inference[1]); drain(database)
    assert client.post(route(run)).status_code == 202
    process_trend(database, claim_trend(database))
    return run, client.get(route(run)).json()


def test_mock_llm_grounding_idempotency_two_runs_and_fresh_restore(client, database, inference):
    doc, body, _ = inference
    run = start(client, body)
    assert client.get(route(run)).json()['status'] == 'missing'
    assert client.post(route(run)).status_code == 409
    drain(database)
    assert client.post(route(run)).status_code == 202
    assert client.post(route(run)).json()['status'] == 'queued'
    job = claim_trend(database)
    assert claim_trend(database) is None
    with Session(database) as db:
        source = collect_source(db, db.get(Run, run['id']))
    assert source['peopleCount'] == 10 and source['responseCount'] == 20
    assert source['questions'][0]['distribution'][3]['count'] == 10
    assert source['questions'][0]['distribution'][3]['percent'] == 100
    assert source['textSampleCount'] == 10 and source['questions'][1]['samples'][0]['parentAnswer'].startswith('4/7점')
    prompt = summary_body(job, source)
    assert prompt['store'] is False and prompt['text']['format']['strict'] is True
    assert 'uuid' not in json.dumps(source) and 'personaId' not in json.dumps(source)
    frozen = client.get(f'/api/v1/runs/{run["id"]}/result').json()['responses']
    doc['survey']['title'] = '새 주제로 바뀐 설계'
    assert client.put('/api/v1/projects/project-test', json=operation(doc, 1)).status_code == 200
    process_trend(database, job)
    first = client.get(route(run)).json()
    assert first['status'] == 'completed' and first['usage']['attempts'] == 1
    assert first['evidence']['topic'] != doc['survey']['title']
    assert 'samples' not in first['evidence']['questions'][1]
    assert first['content']['headline'].startswith('[모의 요약]')
    assert client.post(route(run)).json() == first
    assert claim_trend(database) is None
    second_run = start(client, {**body, 'requestId': str(uuid4()), 'expectedRevision': 2})
    drain(database)
    client.post(route(second_run))
    process_trend(database, claim_trend(database))
    second = client.get(route(second_run)).json()
    assert second['evidence']['topic'] == doc['survey']['title'] and second['sourceHash'] != first['sourceHash']
    with TestClient(app, headers={'X-Persona-Request': '1'}) as fresh:
        assert fresh.post('/api/v1/auth/login', json={k: ADMIN[k] for k in ('username', 'password')}).status_code == 200
        assert fresh.get(route(run)).json() == first
        assert fresh.get(route(second_run)).json() == second
    assert client.get(f'/api/v1/runs/{run["id"]}/result').json()['responses'] == frozen
    with member_client(client) as other:
        for suffix in ('', '/retry'):
            assert other.post(route(run) + suffix).status_code == 404
        assert other.get(route(run)).status_code == 404


def test_demo_is_explicit_and_does_not_call_provider(client, database, monkeypatch):
    _, _, run = create(client)
    drain(database)
    def forbidden(*args):
        raise AssertionError('Demo must not call an external provider')
    monkeypatch.setattr('app.trends.generate_summary', forbidden)
    client.post(route(run))
    process_trend(database, claim_trend(database))
    data = client.get(route(run)).json()
    assert data['status'] == 'completed' and data['content']['headline'] == '시연 응답의 통계 요약'
    assert data['usage']['attempts'] == 0


def test_failure_retry_limit_and_interrupted_request_are_explicit(client, database, inference, monkeypatch):
    run = start(client, inference[1]); drain(database); client.post(route(run))
    claim_trend(database)
    with Session(database) as db, db.begin():
        row = db.get(RunTrend, run['id']); row.lease_until = now() - timedelta(seconds=1); row.attempts = 1
    assert claim_trend(database) is None
    interrupted = client.get(route(run)).json()
    assert interrupted['status'] == 'failed' and interrupted['usage']['unknownAttempts'] == 1
    assert client.post(route(run)).json()['status'] == 'failed'  # Refresh cannot reissue a paid request.
    def reject(*args):
        raise InferenceError('INVALID_MODEL_RESPONSE', '잘못된 요약', retryable=True, usage={'input_tokens': 10})
    monkeypatch.setattr('app.trends.generate_summary', reject)
    assert client.post(route(run) + '/retry').status_code == 202
    process_trend(database, claim_trend(database))
    failed = client.get(route(run)).json()
    assert failed['status'] == 'failed' and failed['content'] is None
    assert failed['usage']['attempts'] == 3 and failed['usage']['inputTokens'] == 20
    assert client.post(route(run) + '/retry').status_code == 422


def test_slow_summary_renews_lease_and_prevents_duplicate_calls(client, database, inference, monkeypatch):
    run = start(client, inference[1]); drain(database); client.post(route(run))
    job = claim_trend(database, 0.4)
    entered, release = threading.Event(), threading.Event()
    def slow(base, key, job, source):
        entered.set(); assert release.wait(5)
        return generate_summary(base, key, job, source)
    monkeypatch.setattr('app.trends.generate_summary', slow)
    thread = threading.Thread(target=process_trend, args=(database, job), kwargs={'lease_seconds': 0.4})
    thread.start()
    try:
        assert entered.wait(3); time.sleep(0.7)
        assert claim_trend(database, 0.4) is None
        assert client.post(route(run)).json()['status'] == 'running'
    finally:
        release.set(); thread.join(5)
    assert client.get(route(run)).json()['status'] == 'completed'


def test_exact_distributions_bounded_samples_and_question_coverage(client, database, inference):
    run = start(client, inference[1]); drain(database)
    with Session(database) as db, db.begin():
        for i, response in enumerate(db.scalars(select(Response).where(Response.run_id == run['id'], Response.question_id == 'q1').order_by(Response.persona_id))):
            response.payload = {**response.payload, 'answer': 0 if i < 5 else 6}
        for response in db.scalars(select(Response).where(Response.run_id == run['id'], Response.question_id == 'q2')):
            response.payload = {**response.payload, 'text': '긴 의견' * 600}
        row = db.get(Run, run['id'])
        survey = copy.deepcopy(row.survey)
        survey['questions'] += [{**survey['questions'][1], 'id': f'extra-{i}'} for i in range(60)]
        db.flush()
        # Exercise the input bound without changing the immutable persisted snapshot.
        source = collect_source(db, SimpleNamespace(id=row.id, survey=survey,
            group_info=row.group_info, succeeded=row.succeeded))
        assert source['questions'][0]['distribution'][0]['percent'] == 50
        assert source['questions'][0]['distribution'][6]['percent'] == 50
        assert source['includedQuestionCount'] == 50 and source['questionCount'] == 62
        assert source['textSampleCount'] <= 40
        assert source['questions'][1]['samples'][0]['truncated']
        assert len(source['questions'][1]['samples'][0]['text']) == 800
        assert len(json.dumps(source, ensure_ascii=False).encode()) < 120000


def test_invalid_model_evidence_is_rejected():
    source = {'questions': [{'id': 'q1'}]}
    bad = {'headline': '제목', 'overview': '요약', 'keyPoints': [{'text': '근거', 'questionIds': ['missing']}]}
    body = {'status': 'completed', 'output': [{'type': 'message', 'content': [{'type': 'output_text', 'text': json.dumps(bad)}]}], 'usage': {'output_tokens': 5}}
    with pytest.raises(InferenceError) as error:
        parse_summary(body, source)
    assert error.value.code == 'INVALID_MODEL_RESPONSE' and error.value.usage['output_tokens'] == 5
    body['output'][0]['content'] = [{'type': 'refusal'}]
    with pytest.raises(InferenceError) as error:
        parse_summary(body, source)
    assert error.value.code == 'MODEL_REFUSAL'
