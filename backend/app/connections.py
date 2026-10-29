from typing import Literal
from uuid import uuid4

from fastapi import APIRouter
from pydantic import Field, SecretStr, model_validator
from sqlalchemy import or_, select, update

from .auth import CurrentUser, DB, now
from .config import settings
from .errors import ApiError
from .models import ModelConnection
from .providers import MODEL_ID, decrypt_key, discover, encrypt_key, endpoint
from .schemas import Contract

router = APIRouter(prefix="/api/v1/connections")


class ConnectionWrite(Contract):
    expectedRevision: int = Field(default=0, ge=0)
    name: str = Field(min_length=1, max_length=100)
    provider: Literal["openai", "anthropic", "dgx"]
    scope: Literal["private", "shared"] = "private"
    baseUrl: str = Field(default="", max_length=1000)
    apiKey: SecretStr | None = Field(default=None, max_length=8192)
    enabled: bool = True
    manualModelIds: list[str] | None = Field(default=None, max_length=100)

    @model_validator(mode="after")
    def valid(self):
        if not self.name.strip():
            raise ValueError("Name is required")
        if self.manualModelIds is not None and (self.provider != "dgx" or any(not MODEL_ID.fullmatch(x) for x in self.manualModelIds)):
            raise ValueError("Invalid manual model IDs")
        if self.apiKey is not None:
            key = self.apiKey.get_secret_value()
            if any(not 33 <= ord(c) <= 126 for c in key):
                raise ValueError("Invalid API key")
        return self


def visible_clause(user):
    return or_(ModelConnection.owner_id == user.id, ModelConnection.scope == "shared")


def connection(db, connection_id, user, edit=False):
    row = db.scalar(select(ModelConnection).where(ModelConnection.id == connection_id, visible_clause(user)))
    if row is None:
        raise ApiError(404, "CONNECTION_NOT_FOUND", "연결을 찾을 수 없습니다.")
    if edit and not editable(row, user):
        raise ApiError(403, "CONNECTION_FORBIDDEN", "이 연결을 변경할 권한이 없습니다.")
    return row


def editable(row, user):
    return user.is_admin if row.scope == "shared" else row.owner_id == user.id


def public_connection(row, user):
    current_endpoint = False
    try:
        current_endpoint = row.base_url == endpoint(row.provider, row.base_url)
    except ApiError:
        pass
    return dict(id=row.id, name=row.name, provider=row.provider, scope=row.scope, baseUrl=row.base_url,
        hasKey=bool(row.encrypted_key), enabled=row.enabled, revision=row.revision, models=row.models,
        status=row.status, lastError=row.last_error, checkedAt=row.checked_at.isoformat() if row.checked_at else None,
        canEdit=editable(row, user), updated=row.updated.isoformat(),
        inferenceReady=settings.openai_inference_enabled and row.provider == "openai" and current_endpoint and row.enabled and row.status == "ready",
        environmentMatches=current_endpoint)


@router.get("")
def listing(db: DB, user: CurrentUser):
    rows = db.scalars(select(ModelConnection).where(visible_clause(user)).order_by(ModelConnection.name))
    return {"connections": [public_connection(row, user) for row in rows],
            "dgxAllowedBaseUrls": settings.dgx_allowed_base_urls, "mockMode": bool(settings.mock_provider_base_url),
            "openaiInferenceEnabled": settings.openai_inference_enabled,
            "inferenceLimits": {"maxPeople": settings.openai_max_people, "maxResponses": settings.openai_max_responses}}


@router.post("", status_code=201)
def create(body: ConnectionWrite, db: DB, user: CurrentUser):
    if body.expectedRevision != 0:
        raise ApiError(409, "CONNECTION_CONFLICT", "새 연결의 수정 번호는 0이어야 합니다.")
    row = ModelConnection(id="conn-" + str(uuid4()), owner_id=user.id, revision=0, models=[], encrypted_key=None,
        status="unchecked", checked_at=None, last_error="")
    apply_write(row, body, user)
    db.add(row)
    db.commit()
    return public_connection(row, user)


def apply_write(row, body, user):
    if body.scope == "shared" and not user.is_admin:
        raise ApiError(403, "ADMIN_REQUIRED", "공용 연결은 관리자만 등록·수정할 수 있습니다.")
    if row.revision and (row.provider != body.provider or row.scope != body.scope):
        raise ApiError(422, "CONNECTION_KIND_FIXED", "공급자와 공유 범위를 바꾸려면 새 연결을 등록하세요.")
    base = endpoint(body.provider, body.baseUrl)
    changed = row.base_url != base or body.apiKey is not None or row.enabled != body.enabled
    if body.apiKey is not None:
        key = body.apiKey.get_secret_value()
        if settings.mock_provider_base_url and body.provider in ("openai", "anthropic") and not key.startswith("fake-"):
            raise ApiError(422, "FAKE_KEY_REQUIRED", "모의 서버 모드에서는 fake-로 시작하는 가짜 키만 사용할 수 있습니다.")
        row.encrypted_key = encrypt_key(key)
    if body.provider != "dgx" and not row.encrypted_key:
        raise ApiError(422, "KEY_REQUIRED", "API 키를 입력하세요.")
    row.name, row.provider, row.scope, row.base_url = body.name.strip(), body.provider, body.scope, base
    row.enabled, row.revision, row.updated = body.enabled, row.revision + 1, now()
    if changed:
        row.models, row.status, row.checked_at, row.last_error = [], "unchecked", None, ""
    if body.manualModelIds is not None:
        row.models = [{"id": x, "name": x, "source": "manual"} for x in dict.fromkeys(body.manualModelIds)]
        row.status, row.checked_at, row.last_error = "manual", None, ""


@router.put("/{connection_id}")
def edit(connection_id: str, body: ConnectionWrite, db: DB, user: CurrentUser):
    row = connection(db, connection_id, user, edit=True)
    db.refresh(row, with_for_update=True)
    if row.revision != body.expectedRevision:
        raise ApiError(409, "CONNECTION_CONFLICT", "다른 화면에서 연결을 변경했습니다. 목록을 새로고침하세요.")
    apply_write(row, body, user)
    db.commit()
    return public_connection(row, user)


@router.post("/{connection_id}/check")
def check(connection_id: str, db: DB, user: CurrentUser):
    row = connection(db, connection_id, user, edit=True)
    if not row.enabled:
        raise ApiError(422, "CONNECTION_DISABLED", "비활성 연결입니다. 먼저 활성화하세요.")
    provider, base, encrypted, revision = row.provider, row.base_url, row.encrypted_key, row.revision
    user_id = user.id
    db.rollback()  # Never hold DB locks while waiting for a provider.
    try:
        models = discover(provider, base, decrypt_key(encrypted))
        values = dict(models=models, status="ready", last_error="", checked_at=now())
    except ApiError as error:
        values = dict(status="error", last_error=error.message, checked_at=now())
    result = db.execute(update(ModelConnection).where(ModelConnection.id == connection_id, ModelConnection.revision == revision)
        .values(**values, updated=now(), revision=revision + 1))
    if result.rowcount != 1:
        db.rollback()
        raise ApiError(409, "CONNECTION_CONFLICT", "확인 중 연결 설정이 변경되었습니다. 다시 확인하세요.")
    db.commit()
    db.expire_all()
    # user is refreshed by SQLAlchemy after rollback; never serialize a key or provider body.
    assert user.id == user_id
    return public_connection(connection(db, connection_id, user), user)


def validate_selection(db, user, selection):
    if selection is None or not hasattr(selection, "connectionId"):
        return  # Legacy selections remain editable for demo runs.
    row = connection(db, selection.connectionId, user)
    if not row.enabled or row.status not in ("ready", "manual"):
        raise ApiError(422, "CONNECTION_NOT_READY", "연결 상태를 확인한 뒤 모델을 선택하세요.")
    if not any(m["id"] == selection.modelId for m in row.models):
        raise ApiError(422, "MODEL_NOT_AVAILABLE", "이 연결의 모델 목록에서 선택하세요.")
