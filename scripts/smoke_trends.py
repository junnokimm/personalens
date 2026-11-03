"""Verify cached trends in the isolated interview-test Docker stack, with fake keys only.

Reuses scripts/smoke_interviews.py's persisted original Parquet cohort.
prepare: add an empty project and a second mock OpenAI run, without new extraction.
verify: check two per-run LLM summaries and a demo summary, then persist their hashes.
restore: after container restart, confirm identical summaries and no extra model calls.
"""
import argparse
import copy
import json
from pathlib import Path
import time
from uuid import uuid4

from smoke_compose import Client, digest, save_state

STATE = Path('.runtime/trend-smoke.json')
SOURCE = Path('.runtime/interview-smoke.json')
BASE = 'http://127.0.0.1:8082'


def wait_for(client, path):
    deadline = time.monotonic() + 60
    while True:
        value = client.call(path)
        if value['status'] not in ('queued', 'running'):
            assert value['status'] == 'completed', value.get('error', value['status'])
            return value
        if time.monotonic() >= deadline:
            raise RuntimeError('Worker did not finish in 60 seconds')
        time.sleep(1)


def draft(project):
    doc = copy.deepcopy({k: project[k] for k in ('id', 'name', 'description', 'survey', 'groups', 'activeGroupId', 'model')})
    for group in doc['groups']:
        if group.get('cohort'):
            group['cohort'] = {'id': group['cohort']['id']}
    return doc


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('phase', choices=('prepare', 'verify', 'restore'))
    phase = parser.parse_args().phase
    previous = json.loads(SOURCE.read_text())
    client = Client(BASE)
    client.call('/auth/login', previous['admin'])
    mode = client.call('/connections')
    if not mode['mockMode'] or not mode['openaiInferenceEnabled']:
        raise RuntimeError('Only the isolated fake-key inference-test stack is allowed')
    if phase == 'prepare':
        if STATE.exists():
            raise RuntimeError('Already prepared; use verify/restore')
        project = client.call(f'/projects/{previous["projectId"]}')
        original = draft(project)
        empty = copy.deepcopy(original)
        empty.update(id='project-trend-empty-' + uuid4().hex[:12], name='추세 안내 검증 · 실행 전')
        for group in empty['groups']:
            group['cohort'] = None
        client.call('/projects', {'document': empty, 'expectedRevision': 0, 'mutationId': str(uuid4())}, status=201)
        changed = copy.deepcopy(original)
        changed['survey']['title'] += ' · 두 번째 모의 회차'
        saved = client.call(f'/projects/{project["id"]}', {'document': changed,
            'expectedRevision': project['revision'], 'mutationId': str(uuid4())}, method='PUT')
        run = client.call(f'/projects/{project["id"]}/runs', {'expectedRevision': saved['revision'],
            'groupId': saved['activeGroupId'], 'engine': 'openai', 'selection': saved['model'],
            'requestId': str(uuid4())}, status=202)
        client.call(f'/projects/{project["id"]}', {'document': original,
            'expectedRevision': saved['revision'], 'mutationId': str(uuid4())}, method='PUT')
        save_state(STATE, {'projectId': project['id'], 'emptyProjectId': empty['id'],
            'runIds': [previous['runId'], run['id']], 'demoRunId': previous['demoRunId']})
        print('Prepared second mock run; draft restored; original frozen cohort reused.')
        print(f'{BASE}/p/{project["id"]}')
        print(f'{BASE}/p/{empty["id"]}')
        return
    state = json.loads(STATE.read_text())
    snapshots = {}
    for run_id in [*state['runIds'], state['demoRunId']]:
        run = wait_for(client, f'/runs/{run_id}')
        path = f'/runs/{run_id}/trend'
        if phase == 'verify':
            client.call(path, {}, status=202)
        summary = wait_for(client, path)
        assert summary['evidence']['responseCount'] == run['succeeded']
        assert summary['evidence']['topic'] == run['survey']['title']
        expected_attempts = 1 if run['engine']['kind'] == 'openai' else 0
        assert summary['usage']['attempts'] == expected_attempts
        assert client.call(path, {}, status=202) == summary
        for question in summary['evidence']['questions']:
            if question['distribution']:
                assert sum(o['count'] for o in question['distribution']) == question['valid']
        snapshots[run_id] = digest(summary)
    assert len(set(snapshots.values())) == 3
    if phase == 'verify':
        state['summaryDigests'] = snapshots
        save_state(STATE, state)
    else:
        assert snapshots == state['summaryDigests'], 'Summary changed or extra model call after restart'
    print('PASS: 2 mock LLM summaries + 1 demo summary; exact counts; per-run cache; fresh login restore.')


if __name__ == '__main__':
    main()
