import hashlib
import json
from datetime import datetime, timezone
from typing import Annotated

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session

from .database import get_session
from .models import Project, TargetGroup
from .schemas import ProjectList, ProjectResponse, SaveProject
from .errors import ApiError
from .runs import router as runs_router
from .snapshots import current_survey
from .auth import CurrentUser, owned_project, router as auth_router
from .connections import router as connections_router, validate_selection
from .config import settings
from .cohorts import router as cohorts_router, resolve_cohort

app = FastAPI(title="PersonaLens persistence API", version="0.1.0")
app.include_router(runs_router)
app.include_router(auth_router)
app.include_router(connections_router)
app.include_router(cohorts_router)
DB = Annotated[Session, Depends(get_session)]


@app.middleware("http")
async def protect_browser_requests(request: Request, call_next):
    if request.url.path.startswith("/api/"):
        origin = request.headers.get("origin")
        if request.method not in ("GET", "HEAD", "OPTIONS") and (
                request.headers.get("x-persona-request") != "1" or (origin and origin not in settings.allowed_origins)):
            return JSONResponse(status_code=403, content={"error": {"code": "UNTRUSTED_REQUEST", "message": "허용되지 않은 요청입니다."}})
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.exception_handler(ApiError)
async def api_error(_request: Request, error: ApiError):
    return JSONResponse(status_code=error.status, content={"error": {"code": error.code, "message": error.message}})


@app.exception_handler(RequestValidationError)
async def validation_error(_request: Request, error: RequestValidationError):
    # Never echo request bodies (including accidentally submitted credentials) into error output.
    fields = [".".join(map(str, item["loc"][1:])) for item in error.errors()]
    return JSONResponse(status_code=422, content={"error": {
        "code": "VALIDATION_ERROR", "message": "저장할 데이터 형식을 확인하세요.", "fields": fields,
    }})


@app.exception_handler(OperationalError)
async def database_error(_request: Request, _error: OperationalError):
    return JSONResponse(status_code=503, content={"error": {
        "code": "DATABASE_UNAVAILABLE", "message": "DB에 연결할 수 없습니다. 잠시 후 다시 시도하세요.",
    }})


def response(project: Project, session: Session) -> ProjectResponse:
    return ProjectResponse(
        id=project.id, name=project.name, description=project.description, survey=current_survey(session, project),
        groups=[dict(id=g.id, name=g.name, count=g.count, filters=g.filters, cohort=g.cohort) for g in project.groups],
        activeGroupId=project.active_group_id, model=project.model,
        revision=project.revision, lastMutationId=project.last_mutation_id,
        updated=project.updated.isoformat().replace("+00:00", "Z"),
    )


def apply_document(project: Project, body: SaveProject, digest: str, session: Session):
    document = body.document
    cohorts = {g.id: resolve_cohort(session, project.id, g.cohort) for g in document.groups}
    project.name = document.name
    project.description = document.description
    project.survey = document.survey.model_dump(mode="json")
    project.active_group_id = document.activeGroupId
    project.model = document.model.model_dump() if document.model else None
    project.revision = body.expectedRevision + 1
    project.last_mutation_id = body.mutationId
    project.last_mutation_hash = digest
    project.updated = datetime.now(timezone.utc)
    previous = {g.id: g for g in project.groups}
    groups = []
    for position, group in enumerate(document.groups):
        row = previous.get(group.id) or TargetGroup(id=group.id)
        row.position, row.name, row.count = position, group.name, group.count
        row.filters = group.filters
        row.cohort = cohorts[group.id]
        groups.append(row)
    project.groups = groups


def save(body: SaveProject, session: Session, user, *, create: bool) -> ProjectResponse:
    digest = hashlib.sha256(json.dumps(body.model_dump(mode="json"), sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    project = session.scalar(select(Project).where(Project.id == body.document.id).with_for_update())
    if project and project.owner_id != user.id:
        raise ApiError(404, "PROJECT_NOT_FOUND", "프로젝트를 찾을 수 없습니다.")
    if project and project.last_mutation_id == body.mutationId:
        if project.last_mutation_hash != digest:
            raise ApiError(409, "MUTATION_REUSED", "같은 저장 요청 ID에 다른 내용을 보낼 수 없습니다.")
        return response(project, session)
    if create:
        if body.expectedRevision != 0:
            raise ApiError(422, "INVALID_REVISION", "새 프로젝트의 수정 번호는 0이어야 합니다.")
        if project:
            raise ApiError(409, "REVISION_CONFLICT", "같은 ID의 프로젝트가 이미 있습니다.")
        project = Project(id=body.document.id, owner_id=user.id, groups=[])
    elif not project:
        raise ApiError(404, "PROJECT_NOT_FOUND", "프로젝트를 찾을 수 없습니다.")
    elif project.revision != body.expectedRevision:
        raise ApiError(409, "REVISION_CONFLICT", "다른 탭에서 프로젝트를 수정했습니다. 서버 내용을 확인하세요.")
    selection = body.document.model.model_dump() if body.document.model else None
    if create or project.model != selection:
        validate_selection(session, user, body.document.model)
    apply_document(project, body, digest, session)
    if create:
        session.add(project)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        # Concurrent creation can reach the PK constraint. A response-lost retry is idempotent.
        existing = session.get(Project, body.document.id)
        if existing and existing.owner_id == user.id and existing.last_mutation_id == body.mutationId and existing.last_mutation_hash == digest:
            return response(existing, session)
        raise ApiError(409, "REVISION_CONFLICT", "동시에 저장된 내용이 있습니다. 서버 내용을 확인하세요.") from None
    return response(project, session)


@app.get("/api/v1/health")
def health(session: DB):
    session.execute(text("SELECT 1"))
    return {"status": "ok"}


@app.get("/api/v1/projects", response_model=ProjectList)
def list_projects(session: DB, user: CurrentUser):
    return {"projects": [response(p, session) for p in session.scalars(select(Project).where(Project.owner_id == user.id).order_by(Project.updated.desc(), Project.id))]}


@app.get("/api/v1/projects/{project_id}", response_model=ProjectResponse)
def get_project(project_id: str, session: DB, user: CurrentUser):
    project = owned_project(session, project_id, user)
    return response(project, session)


@app.post("/api/v1/projects", response_model=ProjectResponse, status_code=201)
def create_project(body: SaveProject, session: DB, user: CurrentUser):
    return save(body, session, user, create=True)


@app.put("/api/v1/projects/{project_id}", response_model=ProjectResponse)
def update_project(project_id: str, body: SaveProject, session: DB, user: CurrentUser):
    if project_id != body.document.id:
        raise ApiError(422, "PROJECT_ID_MISMATCH", "주소와 본문의 프로젝트 ID가 다릅니다.")
    return save(body, session, user, create=False)
