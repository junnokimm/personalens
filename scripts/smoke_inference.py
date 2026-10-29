"""Verify the OpenAI pipeline in inference-test Compose; never uses real keys.

Uses only the administrator credentials from the existing ignored compose smoke state.
prepare creates a separate 10-person source cohort and queued run; verify can run after restart.
"""
import argparse
import json
from pathlib import Path
import time
from uuid import uuid4

from smoke_compose import Client, digest, save_state


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('phase', choices=['prepare', 'verify'])
    args = parser.parse_args()
    auth = json.loads(Path('.runtime/compose-smoke.json').read_text())['admin']
    state_path = Path('.runtime/inference-smoke.json')
    client = Client('http://localhost:8080')
    client.call('/auth/login', auth)
    mode = client.call('/connections')
    assert mode['mockMode'] and mode['openaiInferenceEnabled'], 'Requires inference-test mode; no live API calls allowed'
    if args.phase == 'prepare':
        assert not state_path.exists(), 'Existing verification state found; use verify'
        row = client.call('/connections', {'name': '모의 OpenAI 응답 검증', 'provider': 'openai', 'apiKey': 'fake-openai-test'}, status=201)
        checked = client.call(f'/connections/{row["id"]}/check', {})
        assert checked['inferenceReady']
        model = {'connectionId': row['id'], 'modelId': 'gpt-demo-small'}
        project_id = 'project-openai-' + uuid4().hex[:12]
        filters = {'region': ['서울'], 'age': ['30대'], 'sex': ['여자']}
        document = {'id': project_id, 'name': 'OpenAI 응답 연결 검증 · 10명', 'description': '원본 10명·2문항, 모의 API로 저장·복원 검증 후 실제 모델 선택 가능',
            'survey': {'title': '지역 문화시설 설문', 'description': '페르소나의 관점에서 응답해 주세요.', 'questions': [
                {'id': 'q1', 'type': 'likert', 'text': '지역 문화시설 확충에 동의하나요?', 'scale': 7, 'low': '전혀 아니다', 'high': '매우 그렇다'},
                {'id': 'q2', 'type': 'text', 'parentId': 'q1', 'text': '그렇게 생각하는 이유는 무엇인가요?'}]},
            'groups': [{'id': 'g1', 'name': '서울 30대 여성 · 원본 10명', 'count': 10, 'filters': filters, 'cohort': None}],
            'activeGroupId': 'g1', 'model': model}
        client.call('/projects', {'document': document, 'expectedRevision': 0, 'mutationId': str(uuid4())}, status=201)
        catalog = client.call('/persona-dataset')
        cohort = client.call(f'/projects/{project_id}/cohorts', {'datasetId': catalog['id'], 'groupId': 'g1', 'expectedRevision': 1, 'requestId': str(uuid4())}, status=201)
        assert len(cohort['people']) == len({p['sourceRecordId'] for p in cohort['people']}) == 10
        document['groups'][0]['cohort'] = {'id': cohort['id']}
        client.call(f'/projects/{project_id}', {'document': document, 'expectedRevision': 1, 'mutationId': str(uuid4())}, method='PUT')
        run = client.call(f'/projects/{project_id}/runs', {'engine': 'openai', 'selection': model, 'expectedRevision': 2, 'groupId': 'g1', 'requestId': str(uuid4())}, status=202)
        state = {'projectId': project_id, 'runId': run['id'], 'engine': run['engine'], 'cohortDigest': digest(cohort['people'])}
        save_state(state_path, state)
        print(f'PASS: 10 original records; queued run {run["id"]}; source and model snapshots saved', flush=True)
    else:
        state = json.loads(state_path.read_text())
        deadline = time.monotonic() + 120
        while True:
            result = client.call(f'/runs/{state["runId"]}/result')
            if result['status'] not in ('queued', 'running'):
                break
            assert time.monotonic() < deadline, 'Worker timeout'
            time.sleep(1)
        assert result['status'] == 'completed' and result['engine'] == state['engine']
        assert result['engine']['kind'] == 'openai' and result['engine']['mock'] is True
        assert len(result['responses']) == len({(r['personaId'], r['questionId']) for r in result['responses']}) == 20
        assert result['usage'] == {'attempts': 20, 'inputTokens': 2000, 'outputTokens': 500, 'unknownAttempts': 0}
        assert digest(result['people']) == state['cohortDigest']
        fresh = Client(client.base)
        fresh.call('/auth/login', auth)
        assert fresh.call(f'/runs/{state["runId"]}/result') == result
        if state.get('resultDigest'):
            assert state['resultDigest'] == digest(result)
        state['resultDigest'] = digest(result)
        save_state(state_path, state)
        print('PASS: 20 OpenAI-protocol responses, persisted usage, fresh login and exact result restore', flush=True)
        print(f'{client.base}/p/{state["projectId"]}/results/{state["runId"]}', flush=True)


if __name__ == '__main__':
    main()
