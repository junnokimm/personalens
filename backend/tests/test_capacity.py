import json
from uuid import uuid4

import duckdb
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Run, RunTask
from app.worker import claim
from test_projects import document, operation


def test_ten_thousand_original_records_restore_and_bounded_worker_read(client, database, tmp_path, monkeypatch):
    path = tmp_path / 'capacity.parquet'
    with duckdb.connect() as con:
        con.sql("""SELECT 'source-' || i::VARCHAR uuid, 30::BIGINT age, '서울' region,
            '서울-중구' district, '여자' sex, '연구원' occupation,
            '보존할 전체 서술 원본 ' || i::VARCHAR detailed_persona FROM range(10001) t(i)""").write_parquet(str(path))
    monkeypatch.setattr(settings, 'parquet_path', str(path))
    doc = document()
    doc['groups'][0].update(count=10000, filters={'region': ['서울']}, cohort=None)
    assert client.post('/api/v1/projects', json=operation(doc)).status_code == 201
    dataset = client.get('/api/v1/persona-dataset').json()
    extraction = client.post('/api/v1/projects/project-test/cohorts', json={
        'datasetId': dataset['id'], 'groupId': 'g1', 'expectedRevision': 1, 'requestId': str(uuid4())})
    assert extraction.status_code == 201, extraction.text
    cohort = extraction.json()
    assert len(cohort['people']) == len({p['sourceRecordId'] for p in cohort['people']}) == 10000
    assert all(p['compact'] and 'detailed_persona' not in p['attributes'] for p in cohort['people'])
    doc['groups'][0]['cohort'] = {'id': cohort['id']}
    assert client.put('/api/v1/projects/project-test', json=operation(doc, 1)).status_code == 200
    assert client.get('/api/v1/projects/project-test').json()['groups'][0]['cohort'] == cohort
    started = client.post('/api/v1/projects/project-test/runs', json={'expectedRevision': 2, 'requestId': str(uuid4()), 'groupId': 'g1'})
    assert started.status_code == 202, started.text
    run = started.json()
    assert run['peopleCount'] == 10000 and run['total'] == 20000
    with Session(database) as db:
        r = db.get(Run, run['id'])
        assert 'group_snapshot' not in r.__dict__
        assert db.scalar(select(func.count()).select_from(RunTask)) == 10000
    job = claim(database)
    assert job['person']['attributes']['detailed_persona'].startswith('보존할 전체 서술 원본')
    person = client.get(f'/api/v1/runs/{run["id"]}/personas/{job["persona_id"]}').json()
    assert person == job['person']
    assert client.post(f'/api/v1/runs/{run["id"]}/cancel').status_code == 202
    doc['groups'][0]['count'] = 10001
    assert client.put('/api/v1/projects/project-test', json=operation(doc, 2)).status_code == 422
    assert settings.openai_max_people == 10000 and settings.openai_max_responses >= 20000
