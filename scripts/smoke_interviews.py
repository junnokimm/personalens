"""Isolated fake-key Docker verification (localhost:8082); refuses real provider mode."""
import argparse
import json
from pathlib import Path
from uuid import uuid4

from smoke_compose import Client, digest, save_state

STATE = Path('.runtime/interview-smoke.json')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('phase', choices=['prepare', 'start', 'verify', 'interview', 'restore'])
    phase = parser.parse_args().phase
    c = Client('http://localhost:8082')
    if not STATE.exists():
        assert phase == 'prepare', 'Run prepare first'
        save_state(STATE, {'admin': {'username': 'interview-test', 'password': 'fake-test-only-2026!'}})
    s = json.loads(STATE.read_text())
    if c.call('/auth/session')['needsSetup']:
        c.call('/auth/setup', {**s['admin'], 'name': '모의 인터뷰 검증'}, status=201)
    else:
        c.call('/auth/login', s['admin'])
    mode = c.call('/connections')
    assert mode['mockMode'] and mode['openaiInferenceEnabled'], 'Fake-key inference-test environment required'
    assert mode['inferenceLimits']['maxPeople'] == 10000
    if phase == 'prepare':
        assert 'projectId' not in s, 'Already prepared; use next phase'
        conn = c.call('/connections', {'name': '인터뷰 모의 OpenAI', 'provider': 'openai', 'apiKey': 'fake-openai-test'}, status=201)
        assert c.call(f'/connections/{conn["id"]}/check', {})['inferenceReady']
        model = {'connectionId': conn['id'], 'modelId': 'gpt-demo-small'}
        pid = 'project-interview-' + uuid4().hex[:12]
        doc = {'id': pid, 'name': 'DDP · 인터뷰·진행률 검증 30명', 'description': '격리된 모의 서버 검증. 실제 API 호출 없음.',
            'survey': {'title': 'DDP 철거 후 아파트 건설 찬반', 'description': '가상의 시나리오입니다.', 'questions': [
                {'id': 'q1', 'type': 'likert', 'text': 'DDP를 철거하고 아파트를 건설하는 안에 찬성하십니까?', 'scale': 5, 'low': '매우 반대', 'high': '매우 찬성'},
                {'id': 'q2', 'type': 'text', 'parentId': 'q1', 'text': '그렇게 생각하는 이유는 무엇인가요?'}]},
            'groups': [{'id': 'g1', 'name': '서울 원본 30명', 'count': 30, 'filters': {'region': ['서울']}, 'cohort': None}],
            'activeGroupId': 'g1', 'model': model}
        c.call('/projects', {'document': doc, 'expectedRevision': 0, 'mutationId': str(uuid4())}, status=201)
        catalog = c.call('/persona-dataset')
        cohort = c.call(f'/projects/{pid}/cohorts', {'datasetId': catalog['id'], 'groupId': 'g1', 'expectedRevision': 1, 'requestId': str(uuid4())}, status=201)
        assert len({p['sourceRecordId'] for p in cohort['people']}) == 30
        doc['groups'][0]['cohort'] = {'id': cohort['id']}
        c.call(f'/projects/{pid}', {'document': doc, 'expectedRevision': 1, 'mutationId': str(uuid4())}, method='PUT')
        cancelled = c.call(f'/projects/{pid}/runs', {'expectedRevision': 2, 'groupId': 'g1', 'requestId': str(uuid4())}, status=202)
        assert c.call(f'/runs/{cancelled["id"]}/cancel', {}, status=202)['status'] == 'cancelled'
        demo = c.call(f'/projects/{pid}/runs', {'expectedRevision': 2, 'groupId': 'g1', 'requestId': str(uuid4()), 'failNext': True}, status=202)
        s.update(projectId=pid, model=model, demoRunId=demo['id'], cohortDigest=digest(cohort['people']), runRequestId=str(uuid4()))
        save_state(STATE, s)
        print('Prepared real Parquet 30 people; cancelled run preserved; failure/retry demo queued.', flush=True)
        print(f'{c.base}/p/{pid}/simulation', flush=True)
    elif phase == 'start':
        assert c.call(f'/runs/{s["demoRunId"]}')['status'] == 'completed', 'Retry the demo in the UI first'
        run = c.call(f'/projects/{s["projectId"]}/runs', {'expectedRevision': 2, 'groupId': 'g1', 'requestId': s['runRequestId'], 'engine': 'openai', 'selection': s['model']}, status=202)
        s['runId'] = run['id']; save_state(STATE, s)
        print('Queued 30 × 2 mock OpenAI responses:', run['id'])
    elif phase == 'verify':
        result = c.call(f'/runs/{s["runId"]}/result')
        print(json.dumps({k: result[k] for k in ('status', 'succeeded', 'failed', 'total', 'progress', 'usage')}, ensure_ascii=False))
        if result['status'] in ('queued', 'running'):
            return
        assert result['status'] == 'completed' and len(result['responses']) == 60
        assert len({(r['personaId'], r['questionId']) for r in result['responses']}) == 60
        assert result['engine']['mock'] and digest(result['people']) == s['cohortDigest']
        s['surveyDigest'] = digest(result['responses']); save_state(STATE, s)
        print('PASS: 60 mock responses and exact original cohort saved')
    elif phase == 'interview':
        person = c.call(f'/runs/{s["runId"]}/result')['people'][0]['id']
        body = {'questionId': 'q1', 'question': '앞에서 선택한 점수를 기준으로, 어떤 조건이 바뀌면 의견이 달라질까요?', 'requestId': str(uuid4())}
        route = f'/runs/{s["runId"]}/personas/{person}/interviews'
        turn = c.call(route, body, status=202)
        assert c.call(route, body, status=202)['id'] == turn['id']
        s.update(personaId=person, turnId=turn['id']); save_state(STATE, s)
        print('Queued persistent interview; duplicate POST returns the same turn.')
        print(f'{c.base}/p/{s["projectId"]}/results/{s["runId"]}/interview')
    elif phase == 'restore':
        result = c.call(f'/runs/{s["runId"]}/result')
        assert digest(result['responses']) == s['surveyDigest']
        assert digest(result['people']) == s['cohortDigest']
        route = f'/runs/{s["runId"]}/personas/{s["personaId"]}/interviews'
        turns = c.call(route)['turns']
        assert all(t['status'] == 'completed' for t in turns) and turns
        assert '3/5점 중립' in turns[0]['answer']
        fresh = Client(c.base); fresh.call('/auth/login', s['admin'])
        assert fresh.call(route)['turns'] == turns
        if s.get('interviewDigest'):
            assert digest(turns) == s['interviewDigest']
        s['interviewDigest'] = digest(turns); save_state(STATE, s)
        print(f'PASS: {len(turns)} persisted interview turns; exact fresh-session restore; survey answers unchanged')


if __name__ == '__main__':
    main()
