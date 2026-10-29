import json
import threading
import time
from datetime import timedelta
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.inference import InferenceError, answer_schema, display_answer, interview_body
from app.interviews import claim_interview, process_interview
from app.main import app
from app.models import InterviewTurn, ModelConnection
from app.runs import now
from test_connections import ADMIN, member_client, model_server
from test_inference import inference, start
from test_projects import operation
from test_runs import drain


def completed(client, database, inference):
    _, body, _ = inference
    run = start(client, body)
    drain(database)
    return run


def ask(client, run, question="왜 그렇게 답했나요?", request_id=None, persona="P-000"):
    return client.post(f'/api/v1/runs/{run["id"]}/personas/{persona}/interviews', json={
        'questionId': 'q1', 'question': question, 'requestId': request_id or str(uuid4())})


def thread(client, run, persona="P-000"):
    return client.get(f'/api/v1/runs/{run["id"]}/personas/{persona}/interviews')


def test_live_interview_context_history_snapshot_and_restore(client, database, inference):
    doc, _, _ = inference
    run = completed(client, database, inference)
    accepted = ask(client, run)
    assert accepted.status_code == 202, accepted.text
    job = claim_interview(database)
    prompt = json.loads(interview_body(job)['input'][0]['content'])
    assert prompt['kind'] == 'interview' and len(prompt['previousResponses']) == 2
    assert prompt['persona']['age'] == '20대' and 'uuid' not in prompt['persona']
    assert prompt['previousResponses'][0]['displayAnswer'].startswith('4/7점')
    assert prompt['interviewHistory'] == []
    doc['survey']['title'] = '수정한 초안'
    doc['model'] = None
    assert client.put('/api/v1/projects/project-test', json=operation(doc, 1)).status_code == 200
    process_interview(database, job)
    first = thread(client, run).json()['turns'][0]
    assert first['status'] == 'completed' and '이전 대화 0회' in first['answer']
    assert first['usage'] == {'attempts': 1, 'inputTokens': 100, 'outputTokens': 25, 'unknownAttempts': 0}
    assert ask(client, run, '그 조건이 달라지면요?').status_code == 202
    job = claim_interview(database)
    assert job['survey']['title'] != doc['survey']['title']
    assert job['history'][0]['answer'] == first['answer']
    process_interview(database, job)
    expected = thread(client, run).json()
    assert '이전 대화 1회' in expected['turns'][1]['answer']
    with TestClient(app, headers={'X-Persona-Request': '1'}) as fresh:
        assert fresh.post('/api/v1/auth/login', json={k: ADMIN[k] for k in ('username', 'password')}).status_code == 200
        assert thread(fresh, run).json() == expected
    assert thread(client, run, 'P-001').json()['turns'] == []
    with member_client(client) as other:
        assert thread(other, run).status_code == 404
        assert other.post(f'/api/v1/interviews/{first["id"]}/cancel').status_code == 404
    result = client.get(f'/api/v1/runs/{run["id"]}/result').json()
    assert result['interviewCounts'] == {'P-000': 2}
    assert len(result['responses']) == 20


def test_idempotency_pending_question_and_connection_validation(client, database, inference):
    run = completed(client, database, inference)
    key = str(uuid4())
    first = ask(client, run, request_id=key)
    assert ask(client, run, request_id=key).json()['id'] == first.json()['id']
    assert ask(client, run, '다른 내용', key).status_code == 409
    assert ask(client, run).status_code == 409
    assert ask(client, run, persona='missing').status_code == 404
    assert client.post(f'/api/v1/interviews/{first.json()["id"]}/cancel').json()['status'] == 'cancelled'
    assert claim_interview(database) is None
    with Session(database) as db:
        db.get(ModelConnection, inference[2]['id']).enabled = False
        db.commit()
    assert ask(client, run).json()['error']['code'] == 'OPENAI_NOT_READY'


def test_failure_retry_is_bounded_and_does_not_replace_results(client, database, inference, monkeypatch):
    run = completed(client, database, inference)
    row = ask(client, run).json()
    def reject(*args):
        raise InferenceError('OPENAI_AUTH', '연결 키 권한을 확인하세요.')
    monkeypatch.setattr('app.interviews.generate_interview', reject)
    for attempt in range(3):
        process_interview(database, claim_interview(database))
        turn = thread(client, run).json()['turns'][0]
        assert turn['status'] == 'failed' and turn['answer'] == ''
        assert turn['usage']['attempts'] == attempt + 1
        response = client.post(f'/api/v1/interviews/{row["id"]}/retry')
        assert response.status_code == (202 if attempt < 2 else 422)
    assert len(client.get(f'/api/v1/runs/{run["id"]}/result').json()['responses']) == 20


def test_interrupted_interview_is_not_automatically_billed_again(client, database, inference):
    run = completed(client, database, inference)
    row = ask(client, run).json()
    claim_interview(database)
    with Session(database) as db:
        t = db.get(InterviewTurn, row['id'])
        t.lease_until = now() - timedelta(seconds=1)
        db.commit()
    assert claim_interview(database) is None
    failed = thread(client, run).json()['turns'][0]
    assert failed['errorCode'] == 'INTERRUPTED_REQUEST' and failed['usage']['unknownAttempts'] == 1
    assert client.post(f'/api/v1/interviews/{row["id"]}/retry').status_code == 202
    process_interview(database, claim_interview(database))
    assert thread(client, run).json()['turns'][0]['status'] == 'completed'


def test_slow_interview_renews_lease_and_cancel_discards_late_reply(client, database, inference, monkeypatch):
    run = completed(client, database, inference)
    row = ask(client, run).json()
    entered, release = threading.Event(), threading.Event()
    def slow(*args):
        entered.set()
        assert release.wait(5)
        return '늦은 답변', {'input_tokens': 11, 'output_tokens': 4}
    monkeypatch.setattr('app.interviews.generate_interview', slow)
    job = claim_interview(database, 0.3)
    worker = threading.Thread(target=process_interview, args=(database, job), kwargs={'lease_seconds': 0.3})
    worker.start()
    try:
        assert entered.wait(3)
        time.sleep(0.6)
        assert claim_interview(database, 0.3) is None
        assert thread(client, run).json()['turns'][0]['status'] == 'running'
        assert client.post(f'/api/v1/interviews/{row["id"]}/cancel').status_code == 202
    finally:
        release.set(); worker.join(5)
    t = thread(client, run).json()['turns'][0]
    assert t['status'] == 'cancelled' and t['answer'] == ''
    assert t['usage']['inputTokens'] == 11


def test_schema_and_human_readable_answer_meaning():
    q = {'type': 'likert', 'scale': 5, 'low': '매우 반대', 'high': '매우 찬성'}
    assert '2/5점 반대' in display_answer(q, {'answer': 1})
    schema = answer_schema(q)
    assert schema['properties']['text']['enum'] == ['']
    assert schema['properties']['otherText']['enum'] == ['']
    text = answer_schema({'type': 'text'})
    assert text['properties']['answer'] == {'type': 'null'}
