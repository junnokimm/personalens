"""Dataset discovery and immutable cohorts, separate from project draft autosave."""
import copy
import json
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from .auth import CurrentUser, owned_project
from .database import get_session
from .errors import ApiError
from .models import PersonaCohort, PersonaDataset
from .persona_data import dataset, query_slot
from .schemas import Contract, Identifier
from .snapshots import digest
from .profiles import public_cohort

router = APIRouter(prefix="/api/v1")


class CountQuery(Contract):
    datasetId: Identifier
    filters: dict[str, list[str]] = Field(default_factory=dict, max_length=60)


class BuildCohort(Contract):
    datasetId: Identifier
    groupId: Identifier
    expectedRevision: int = Field(ge=1, strict=True)
    requestId: Identifier


@router.get("/persona-dataset")
def catalog(user: CurrentUser):
    with query_slot():
        return dataset().catalog


@router.post("/persona-dataset/count")
def count(body: CountQuery, user: CurrentUser):
    with query_slot():
        source = dataset()
        if source.id != body.datasetId:
            raise ApiError(409, "DATASET_CHANGED", "데이터 버전이 바뀌었습니다. 조건 목록을 새로고침하세요.")
        return dict(datasetId=source.id, count=source.count(body.filters), total=source.catalog["total"])


def get_cohort(session, project_id, cohort_id):
    cohort = session.get(PersonaCohort, cohort_id)
    if not cohort or cohort.project_id != project_id:
        raise ApiError(422, "INVALID_COHORT", "이 프로젝트에서 구성한 대상 집단을 선택하세요.")
    return copy.deepcopy(cohort.payload)


def resolve_cohort(session, project_id, cohort):
    if cohort is None:
        return None
    if cohort.id:
        # Never trust attributes/source metadata sent back by a browser.
        return get_cohort(session, project_id, cohort.id)
    if cohort.source or any(p.sourceRecordId is not None for p in cohort.people):
        raise ApiError(422, "INVALID_COHORT", "원본 집단은 서버에서 구성해야 합니다.")
    return cohort.model_dump(mode="json", exclude_none=True)


@router.get("/projects/{project_id}/cohorts/{cohort_id}")
def read_cohort(project_id: str, cohort_id: str, user: CurrentUser, session: Session = Depends(get_session)):
    owned_project(session, project_id, user)
    return public_cohort(get_cohort(session, project_id, cohort_id))


@router.post("/projects/{project_id}/cohorts", status_code=201)
def build(project_id: str, body: BuildCohort, user: CurrentUser, session: Session = Depends(get_session)):
    project = owned_project(session, project_id, user)
    request_hash = digest(body.model_dump())
    existing = session.scalar(select(PersonaCohort).where(
        PersonaCohort.project_id == project_id, PersonaCohort.request_id == body.requestId))
    if existing:
        if existing.request_hash != request_hash:
            raise ApiError(409, "REQUEST_REUSED", "같은 추출 요청 ID에 다른 내용을 보낼 수 없습니다.")
        return public_cohort(existing.payload)
    if project.revision != body.expectedRevision:
        raise ApiError(409, "REVISION_CONFLICT", "최신 대상 조건을 저장한 뒤 다시 구성하세요.")
    group = next((g for g in project.groups if g.id == body.groupId), None)
    if group is None or group.count is None or not 10 <= group.count <= 10000:
        raise ApiError(422, "INVALID_GROUP", "추출할 집단과 인원(10~10,000명)을 확인하세요.")
    filters, size = copy.deepcopy(group.filters), group.count
    # Do not hold a transaction or a project lock while scanning Parquet.
    session.rollback()
    with query_slot():
        source = dataset()
        if source.id != body.datasetId:
            raise ApiError(409, "DATASET_CHANGED", "데이터 버전이 바뀌었습니다. 조건 목록을 새로고침하세요.")
        people, matched = source.sample(filters, size, body.requestId)
    timestamp = datetime.now(timezone.utc)
    payload = dict(id="cohort-" + uuid4().hex, builtFrom=json.dumps(
        dict(count=size, filters=filters), ensure_ascii=False, sort_keys=True),
        created=timestamp.isoformat().replace("+00:00", "Z"), people=people, textFiltersIgnored=[],
        source=dict(kind="parquet", datasetId=source.id, name=source.path.name, total=source.catalog["total"],
                    matched=matched, seed=body.requestId, samplerVersion="sha256-uuid-v1"))
    project = owned_project(session, project_id, user, lock=True)
    # Recover an identical concurrent request after its first commit.
    existing = session.scalar(select(PersonaCohort).where(
        PersonaCohort.project_id == project_id, PersonaCohort.request_id == body.requestId))
    if existing:
        if existing.request_hash != request_hash:
            raise ApiError(409, "REQUEST_REUSED", "이미 사용된 추출 요청 ID입니다.")
        return public_cohort(existing.payload)
    if project.revision != body.expectedRevision:
        raise ApiError(409, "REVISION_CONFLICT", "추출 중 설계가 변경되었습니다. 현재 조건으로 다시 구성하세요.")
    session.execute(insert(PersonaDataset).values(id=source.id, source_path=str(source.path),
        metadata_json=dict(name=source.path.name, rows=source.catalog["total"], columns=source.catalog["columns"]),
        created=timestamp).on_conflict_do_nothing(index_elements=["id"]))
    session.add(PersonaCohort(id=payload["id"], project_id=project_id, dataset_id=source.id,
        request_id=body.requestId, request_hash=request_hash, payload=payload, created=timestamp))
    session.commit()
    return public_cohort(payload)
