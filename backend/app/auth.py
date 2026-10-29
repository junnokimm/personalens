import hashlib
import hmac
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, Request, Response
from pydantic import Field, SecretStr
from sqlalchemy import delete, select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import settings
from .database import get_session
from .errors import ApiError
from .models import AuthSession, Project, User
from .schemas import Contract

router = APIRouter(prefix="/api/v1/auth")
COOKIE = "persona_session"
DB = Annotated[Session, Depends(get_session)]


def now():
    return datetime.now(timezone.utc)


def hash_password(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()
    return salt + ":" + digest


def public_user(user):
    return dict(id=user.id, username=user.username, name=user.name, isAdmin=user.is_admin)


def session_user(request, db):
    token = request.cookies.get(COOKIE, "")
    if not token:
        return None
    return db.scalar(select(User).join(AuthSession, AuthSession.user_id == User.id).where(
        AuthSession.token_hash == hashlib.sha256(token.encode()).hexdigest(), AuthSession.expires > now()))


def require_user(request: Request, db: DB):
    user = session_user(request, db)
    if user is None:
        raise ApiError(401, "LOGIN_REQUIRED", "로그인이 필요합니다. 다시 로그인해 주세요.")
    identity = request.headers.get("x-persona-user")
    if identity and identity != user.id:
        raise ApiError(401, "SESSION_CHANGED", "다른 탭에서 계정이 변경되었습니다. 새로고침해 주세요.")
    return user


CurrentUser = Annotated[User, Depends(require_user)]


def owned_project(db, project_id, user, lock=False):
    query = select(Project).where(Project.id == project_id, Project.owner_id == user.id)
    project = db.scalar(query.with_for_update() if lock else query)
    if project is None:
        raise ApiError(404, "PROJECT_NOT_FOUND", "프로젝트를 찾을 수 없습니다.")
    return project


class Login(Contract):
    username: str = Field(min_length=3, max_length=80, pattern=r"^[a-zA-Z0-9_.@-]+$")
    password: SecretStr = Field(min_length=1, max_length=128)


class NewUser(Login):
    password: SecretStr = Field(min_length=10, max_length=128)
    name: str = Field(min_length=1, max_length=100)


def add_user(db, body, admin=False):
    user = User(id="user-" + str(uuid4()), username=body.username.lower(), name=body.name.strip(),
        password_hash=hash_password(body.password.get_secret_value()), is_admin=admin, created=now())
    if not user.name:
        raise ApiError(422, "INVALID_NAME", "이름을 입력하세요.")
    db.add(user)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise ApiError(409, "USERNAME_EXISTS", "이미 등록된 아이디입니다.") from None
    return user


def issue_session(db, response, user):
    token = secrets.token_urlsafe(32)
    db.execute(delete(AuthSession).where(AuthSession.expires <= now()))
    db.add(AuthSession(token_hash=hashlib.sha256(token.encode()).hexdigest(), user_id=user.id, expires=now() + timedelta(days=7)))
    db.commit()
    response.set_cookie(COOKIE, token, httponly=True, secure=settings.cookie_secure, samesite="strict", max_age=604800, path="/api")
    return {"user": public_user(user), "needsSetup": False}


@router.get("/session")
def current(request: Request, db: DB):
    user = session_user(request, db)
    return {"user": public_user(user) if user else None, "needsSetup": db.scalar(select(User.id).limit(1)) is None}


@router.post("/setup", status_code=201)
def setup(body: NewUser, response: Response, db: DB):
    # Serialize first-run setup; legacy data can only be claimed once.
    db.execute(text("SELECT pg_advisory_xact_lock(73102941)"))
    if db.scalar(select(User.id).limit(1)):
        raise ApiError(409, "SETUP_COMPLETE", "초기 설정이 완료되었습니다. 로그인하세요.")
    user = add_user(db, body, admin=True)
    db.execute(update(Project).where(Project.owner_id.is_(None)).values(owner_id=user.id))
    return issue_session(db, response, user)


# Small bounded per-process throttle; deployments with multiple API workers need a shared limiter.
_attempts, _lock = {}, threading.Lock()


@router.post("/login")
def login(body: Login, request: Request, response: Response, db: DB):
    source = request.client.host if request.client else "unknown"
    with _lock:
        cutoff = time.monotonic() - 60
        for key in list(_attempts):
            _attempts[key] = [t for t in _attempts[key] if t > cutoff]
            if not _attempts[key]:
                del _attempts[key]
        attempts = _attempts.setdefault(source, [])
        if len(attempts) >= 20:
            raise ApiError(429, "LOGIN_RATE_LIMIT", "로그인 시도가 많습니다. 잠시 후 다시 시도하세요.")
        attempts.append(time.monotonic())
    user = db.scalar(select(User).where(User.username == body.username.lower()))
    expected = user.password_hash if user else hash_password("unused-password", "00" * 16)
    actual = hash_password(body.password.get_secret_value(), expected.split(":")[0])
    if not user or not hmac.compare_digest(expected, actual):
        raise ApiError(401, "INVALID_LOGIN", "아이디 또는 비밀번호가 일치하지 않습니다.")
    return issue_session(db, response, user)


@router.post("/logout")
def logout(request: Request, response: Response, db: DB):
    token = request.cookies.get(COOKIE, "")
    db.execute(delete(AuthSession).where(AuthSession.token_hash == hashlib.sha256(token.encode()).hexdigest()))
    db.commit()
    response.delete_cookie(COOKIE, path="/api")
    return {"ok": True}


@router.post("/users", status_code=201)
def create_user(body: NewUser, db: DB, user: CurrentUser):
    if not user.is_admin:
        raise ApiError(403, "ADMIN_REQUIRED", "관리자만 팀원을 등록할 수 있습니다.")
    created = add_user(db, body)
    db.commit()
    return public_user(created)
