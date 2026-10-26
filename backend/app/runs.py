import copy
import json
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends
from pydantic import Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .database import get_session
from .errors import ApiError
from .models import Project, Response, Run, RunTask, SurveyVersion
from .schemas import Contract, Identifier, SurveyContent
from .snapshots import content, digest, survey_state, versions
from .auth import CurrentUser, owned_project

router = APIRouter(prefix="/api/v1")
ACTIVE = ("queued", "running")


def now():
    return datetime.now(timezone.utc)


class StartRun(Contract):
    expectedRevision: int = Field(ge=1, strict=True)
    requestId: Identifier
    groupId: Identifier
    failNext: bool = False


def summary(run):
    group = run.group_snapshot
    return dict(id=run.id, projectId=run.project_id, number=run.number, created=run.created.isoformat(),
        updated=run.updated.isoformat(), status=run.status,
        progress=int(100 * (run.succeeded + run.failed) / run.total),
        succeeded=run.succeeded, failed=run.failed, total=run.total, responseCount=run.succeeded,
        survey=run.survey, groupId=group["id"], groupName=group["name"],
        groupConfig={"count": group["count"], "filters": group["filters"]},
        cohortCreated=group["cohort"]["created"], peopleCount=len(group["cohort"]["people"]),
        engine=run.engine, model=None, failNote=run.fail_note)


def get_run(session, run_id, user, lock=False):
    query = select(Run).where(Run.id == run_id)
    run = session.scalar(query.with_for_update() if lock else query)
    if not run:
        raise ApiError(404, "RUN_NOT_FOUND", "실행을 찾을 수 없습니다.")
    owned_project(session, run.project_id, user)
    return run


def validate_execution(project, group):
    survey = SurveyContent.model_validate(content(project.survey)).model_dump()
    if not survey["title"].strip() or not survey["questions"]:
        raise ApiError(422, "INVALID_SURVEY", "설문 주제와 문항을 입력하세요.")
    for q in survey["questions"]:
        if not q["text"].strip():
            raise ApiError(422, "INVALID_SURVEY", "빈 질문을 입력한 뒤 실행하세요.")
        if q["type"] == "choice":
            options = [x.strip() for x in q["options"]]
            if len(options) < 2 or not all(options) or len(set(options)) != len(options):
                raise ApiError(422, "INVALID_SURVEY", "선택지는 중복 없이 두 개 이상 입력하세요.")
        if q["type"] == "likert" and (not q["low"].strip() or not q["high"].strip()):
            raise ApiError(422, "INVALID_SURVEY", "척도 양끝 이름을 입력하세요.")
    if group.count is None or not 10 <= group.count <= 500:
        raise ApiError(422, "INVALID_GROUP", "페르소나 수는 10~500명이어야 합니다.")
    try:
        built = json.loads(group.cohort["builtFrom"])
        valid = built == {"count": group.count, "filters": group.filters} and len(group.cohort["people"]) == group.count
    except (TypeError, KeyError, ValueError):
        valid = False
    if not valid:
        raise ApiError(422, "COHORT_STALE", "대상 집단을 현재 조건으로 다시 구성하세요.")
    return survey


@router.post("/projects/{project_id}/runs", status_code=202)
def start(project_id: str, body: StartRun, user: CurrentUser, session: Session = Depends(get_session)):
    project = owned_project(session, project_id, user, lock=True)
    request_hash = digest(body.model_dump())
    existing = session.scalar(select(Run).where(Run.project_id == project_id, Run.request_id == body.requestId))
    if existing:
        if existing.request_hash != request_hash:
            raise ApiError(409, "REQUEST_REUSED", "같은 실행 요청 ID에 다른 내용을 보낼 수 없습니다.")
        return summary(existing)
    if project.revision != body.expectedRevision:
        raise ApiError(409, "REVISION_CONFLICT", "설계가 변경되었습니다. 최신 내용을 저장·확인한 뒤 실행하세요.")
    if session.scalar(select(Run.id).where(Run.project_id == project_id, Run.status.in_(ACTIVE))):
        raise ApiError(409, "RUN_ACTIVE", "이 프로젝트에 진행 중인 실행이 있습니다.")
    group = next((g for g in project.groups if g.id == body.groupId), None)
    if group is None:
        raise ApiError(422, "INVALID_GROUP", "프로젝트의 대상 집단을 선택하세요.")
    survey = validate_execution(project, group)
    rows = versions(session, project_id)
    version = rows[-1] if rows else None
    if version is None or version.content_hash != digest(survey):
        version = SurveyVersion(id=str(uuid4()), project_id=project_id, version=len(rows) + 1,
            content_hash=digest(survey), document=copy.deepcopy(survey), created=now())
        session.add(version)
        session.flush()
    # Root questions and their children are executed together, regardless of editor array order.
    questions = survey["questions"]
    survey["questions"] = [q for root in questions if not root["parentId"]
                           for q in [root, *[child for child in questions if child["parentId"] == root["id"]]]]
    survey["version"] = version.version
    group_snapshot = dict(id=group.id, name=group.name, count=group.count, filters=group.filters, cohort=group.cohort)
    timestamp = now()
    run = Run(id="run-" + str(uuid4()), project_id=project_id,
        number=(session.scalar(select(func.max(Run.number)).where(Run.project_id == project_id)) or 0) + 1,
        request_id=body.requestId, request_hash=request_hash, survey_version_id=version.id,
        survey=survey, group_snapshot=copy.deepcopy(group_snapshot),
        engine={"name": "서버 시연 생성기", "kind": "demo", "version": "1", "seed": digest([survey, group_snapshot]), "selectedModel": project.model},
        status="queued", total=group.count * len(questions), succeeded=0, failed=0, fail_note="",
        created=timestamp, updated=timestamp)
    session.add(run)
    session.flush()
    for i, person in enumerate(group.cohort["people"]):
        session.add(RunTask(run_id=run.id, persona_id=person["id"], person_index=i, status="queued",
            next_question=0, attempts=0, fail_once=body.failNext and i == group.count * 3 // 5, error=""))
    session.commit()
    return summary(run)


@router.get("/projects/{project_id}/runs")
def list_runs(project_id: str, user: CurrentUser, session: Session = Depends(get_session)):
    owned_project(session, project_id, user)
    return {"runs": [summary(r) for r in session.scalars(select(Run).where(Run.project_id == project_id).order_by(Run.number.desc()))],
            "surveyState": survey_state(versions(session, project_id))}


@router.get("/runs/{run_id}")
def status(run_id: str, user: CurrentUser, session: Session = Depends(get_session)):
    return summary(get_run(session, run_id, user))


@router.get("/runs/{run_id}/result")
def result(run_id: str, user: CurrentUser, session: Session = Depends(get_session)):
    # Keep counters and responses consistent with concurrent commits.
    run = get_run(session, run_id, user, lock=True)
    rows = session.scalars(select(Response).where(Response.run_id == run_id).order_by(Response.persona_id, Response.question_id))
    return {**summary(run), "people": run.group_snapshot["cohort"]["people"], "responses": [r.payload for r in rows]}


@router.post("/runs/{run_id}/retry", status_code=202)
def retry(run_id: str, user: CurrentUser, session: Session = Depends(get_session)):
    project_id = get_run(session, run_id, user).project_id
    session.execute(select(Project.id).where(Project.id == project_id).with_for_update())
    run = session.scalar(select(Run).where(Run.id == run_id).with_for_update().execution_options(populate_existing=True))
    if run.status in ACTIVE or run.status == "completed":
        return summary(run)
    if run.status == "cancelled":
        raise ApiError(409, "RUN_CANCELLED", "취소한 실행은 새 실행으로 다시 시작하세요.")
    if session.scalar(select(Run.id).where(Run.project_id == project_id, Run.status.in_(ACTIVE))):
        raise ApiError(409, "RUN_ACTIVE", "진행 중인 다른 실행이 있습니다.")
    for task in session.scalars(select(RunTask).where(RunTask.run_id == run_id, RunTask.status == "failed").with_for_update()):
        task.status, task.error, task.attempts = "queued", "", 0
        task.lease_token = task.lease_until = None
    run.status, run.failed, run.fail_note, run.finished, run.updated = "queued", 0, "", None, now()
    session.commit()
    return summary(run)


@router.post("/runs/{run_id}/cancel", status_code=202)
def cancel(run_id: str, user: CurrentUser, session: Session = Depends(get_session)):
    run = get_run(session, run_id, user, lock=True)
    if run.status in ACTIVE:
        for task in session.scalars(select(RunTask).where(RunTask.run_id == run_id, RunTask.status.in_(ACTIVE)).with_for_update()):
            task.status, task.lease_token, task.lease_until = "cancelled", None, None
        run.status, run.finished, run.updated = "cancelled", now(), now()
        run.fail_note = "사용자가 실행을 취소했습니다. 저장된 응답은 보존됩니다."
        session.commit()
    return summary(run)
