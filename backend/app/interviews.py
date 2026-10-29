"""Run-scoped interviews: durable queue, idempotent questions and bounded calls."""
import threading
from datetime import timedelta
from uuid import uuid4

from fastapi import APIRouter, Depends
from pydantic import Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .auth import CurrentUser
from .database import get_session
from .errors import ApiError
from .inference import credentials, display_answer, generate_interview, InferenceError, validate_connection
from .models import InterviewTurn, ModelConnection, Response, Run, RunTask
from .runs import ACTIVE, get_run, now
from .schemas import Contract, Identifier

router = APIRouter(prefix="/api/v1")
MAX_ATTEMPTS = 3
HISTORY_TURNS = 10


class Ask(Contract):
    requestId: Identifier
    questionId: Identifier | None = None
    question: str = Field(min_length=1, max_length=2000)


def public(turn):
    return dict(id=turn.id, requestId=turn.request_id, runId=turn.run_id, personaId=turn.persona_id, sequence=turn.sequence,
        qid=turn.question_id, question=turn.question, answer=turn.answer, status=turn.status,
        error=turn.error, errorCode=turn.error_code, created=turn.created.isoformat(), updated=turn.updated.isoformat(),
        usage=dict(attempts=turn.attempts, inputTokens=turn.input_tokens, outputTokens=turn.output_tokens, unknownAttempts=turn.unknown_attempts))


def validate_model(db, run, user):
    if run.engine.get("kind") != "openai":
        return
    spec = run.engine
    row = db.get(ModelConnection, spec["selectedModel"]["connectionId"])
    validate_connection(row, spec["selectedModel"]["modelId"], user.id)
    from .config import settings
    if row.base_url != spec["endpoint"] or bool(settings.mock_provider_base_url) != spec["mock"]:
        raise ApiError(422, "INFERENCE_MODE_CHANGED", "원래 실행과 연결 환경이 다릅니다. 해당 연결 환경에서 인터뷰하세요.")


def task_for(db, run_id, persona_id):
    task = db.get(RunTask, (run_id, persona_id))
    if not task:
        raise ApiError(404, "PERSONA_NOT_FOUND", "이 실행의 페르소나를 선택하세요.")
    return task


@router.get("/runs/{run_id}/personas/{persona_id}/interviews")
def listing(run_id: str, persona_id: str, user: CurrentUser, db: Session = Depends(get_session)):
    run = get_run(db, run_id, user)
    task_for(db, run_id, persona_id)
    turns = db.scalars(select(InterviewTurn).where(InterviewTurn.run_id == run_id,
        InterviewTurn.persona_id == persona_id).order_by(InterviewTurn.sequence))
    return dict(turns=[public(t) for t in turns], engine=run.engine, historyTurns=HISTORY_TURNS)


@router.post("/runs/{run_id}/personas/{persona_id}/interviews", status_code=202)
def ask(run_id: str, persona_id: str, body: Ask, user: CurrentUser, db: Session = Depends(get_session)):
    run = get_run(db, run_id, user, lock=True)
    task_for(db, run_id, persona_id)
    query = select(InterviewTurn).where(InterviewTurn.run_id == run_id, InterviewTurn.persona_id == persona_id)
    old = db.scalar(query.where(InterviewTurn.request_id == body.requestId))
    if old:
        if old.question != body.question.strip() or old.question_id != body.questionId:
            raise ApiError(409, "REQUEST_REUSED", "동일한 질문 요청 ID로 다른 질문을 보낼 수 없습니다.")
        return public(old)
    if not body.question.strip():
        raise ApiError(422, "EMPTY_QUESTION", "인터뷰 질문을 입력하세요.")
    if run.status in ACTIVE:
        raise ApiError(409, "RUN_ACTIVE", "설문 실행이 끝난 뒤 인터뷰를 시작하세요.")
    if body.questionId and not db.get(Response, (run_id, persona_id, body.questionId)):
        raise ApiError(422, "ANSWER_MISSING", "저장된 응답이 있는 문항을 선택하세요.")
    if not db.scalar(select(Response.question_id).where(Response.run_id == run_id, Response.persona_id == persona_id).limit(1)):
        raise ApiError(422, "ANSWER_MISSING", "아직 저장된 설문 응답이 없는 페르소나입니다.")
    if db.scalar(query.where(InterviewTurn.status.in_(ACTIVE))):
        raise ApiError(409, "INTERVIEW_ACTIVE", "이 페르소나의 답변을 기다린 뒤 다음 질문을 보내세요.")
    validate_model(db, run, user)
    sequence = (db.scalar(select(func.max(InterviewTurn.sequence)).where(
        InterviewTurn.run_id == run_id, InterviewTurn.persona_id == persona_id)) or 0) + 1
    turn = InterviewTurn(id="interview-" + str(uuid4()), run_id=run_id, persona_id=persona_id,
        request_id=body.requestId, sequence=sequence, question_id=body.questionId, question=body.question.strip(),
        answer="", status="queued", error="", error_code="", attempts=0, input_tokens=0,
        output_tokens=0, unknown_attempts=0, created=now(), updated=now())
    db.add(turn)
    db.commit()
    return public(turn)


@router.post("/interviews/{turn_id}/{action}", status_code=202)
def action(turn_id: str, action: str, user: CurrentUser, db: Session = Depends(get_session)):
    run_id = db.scalar(select(InterviewTurn.run_id).where(InterviewTurn.id == turn_id))
    if not run_id:
        raise ApiError(404, "INTERVIEW_NOT_FOUND", "인터뷰를 찾을 수 없습니다.")
    run = get_run(db, run_id, user, lock=True)
    turn = db.scalar(select(InterviewTurn).where(InterviewTurn.id == turn_id).with_for_update())
    if action == "cancel":
        if turn.status in ACTIVE:
            turn.status, turn.lease_token, turn.lease_until = "cancelled", None, None
    elif action == "retry":
        if turn.status != "failed":
            return public(turn)
        if turn.attempts >= MAX_ATTEMPTS:
            raise ApiError(422, "ATTEMPT_LIMIT", "최대 3회 호출했습니다. 연결을 확인하고 새 질문을 보내세요.")
        # Retrying an older turn after subsequent questions would rewrite conversation history.
        if db.scalar(select(InterviewTurn.id).where(InterviewTurn.run_id == run.id,
                InterviewTurn.persona_id == turn.persona_id, InterviewTurn.sequence > turn.sequence).limit(1)):
            raise ApiError(409, "INTERVIEW_HAS_LATER_TURNS", "이후 대화가 있습니다. 같은 내용을 새 질문으로 보내세요.")
        validate_model(db, run, user)
        turn.status, turn.error, turn.error_code = "queued", "", ""
        turn.lease_token = turn.lease_until = None
    else:
        raise ApiError(404, "UNKNOWN_ACTION", "지원하지 않는 인터뷰 동작입니다.")
    turn.updated = now()
    db.commit()
    return public(turn)


def claim_interview(db_engine, lease_seconds=30):
    with Session(db_engine) as db, db.begin():
        # An expired in-flight request may have been billed. Never repeat it automatically.
        expired = db.scalars(select(InterviewTurn).where(InterviewTurn.status == "running",
            InterviewTurn.lease_until < now()).with_for_update(skip_locked=True).limit(10))
        for turn in expired:
            turn.status, turn.error_code = "failed", "INTERRUPTED_REQUEST"
            turn.error = "이전 호출의 완료 여부를 알 수 없습니다. 사용 내역 확인 후 재시도하세요."
            turn.unknown_attempts += 1
            turn.lease_token = turn.lease_until = None
            turn.updated = now()
        turn = db.scalar(select(InterviewTurn).where(InterviewTurn.status == "queued")
            .order_by(InterviewTurn.created).with_for_update(skip_locked=True).limit(1))
        if not turn:
            return None
        run = db.get(Run, turn.run_id)
        task = task_for(db, run.id, turn.persona_id)
        person = db.scalar(select(Run.group_snapshot["cohort"]["people"][task.person_index]).where(Run.id == run.id))
        prior = {r.question_id: r.payload for r in db.scalars(select(Response).where(
            Response.run_id == run.id, Response.persona_id == turn.persona_id))}
        history = list(db.scalars(select(InterviewTurn).where(InterviewTurn.run_id == run.id,
            InterviewTurn.persona_id == turn.persona_id, InterviewTurn.sequence < turn.sequence,
            InterviewTurn.status == "completed").order_by(InterviewTurn.sequence.desc()).limit(HISTORY_TURNS)))
        turn.status, turn.lease_token, turn.lease_until = "running", str(uuid4()), now() + timedelta(seconds=lease_seconds)
        turn.updated = now()
        return dict(turn_id=turn.id, token=turn.lease_token, run_id=run.id, project_id=run.project_id,
            persona_id=turn.persona_id, person=person, engine=run.engine, survey=run.survey, prior=prior,
            question=turn.question, question_id=turn.question_id,
            history=[dict(question=t.question, answer=t.answer, questionId=t.question_id) for t in reversed(history)])


def locked_turn(db, job):
    turn = db.scalar(select(InterviewTurn).where(InterviewTurn.id == job["turn_id"]).with_for_update())
    if not turn or turn.status != "running" or turn.lease_token != job["token"] or turn.lease_until < now():
        return None
    return turn


def process_interview(db_engine, job, *, lease_seconds=30, stop=None):
    stop = stop or threading.Event()
    finished, lost = threading.Event(), threading.Event()

    def renew():
        with Session(db_engine) as db, db.begin():
            turn = locked_turn(db, job)
            if not turn:
                return False
            turn.lease_until = now() + timedelta(seconds=lease_seconds)
            return True

    def heartbeat():
        while not finished.wait(min(5, lease_seconds / 3)):
            try:
                if not renew():
                    lost.set(); return
            except Exception:
                lost.set(); return

    if stop.is_set() or not renew():
        return
    keeper = threading.Thread(target=heartbeat, daemon=True)
    keeper.start()
    try:
        for retry_number in range(2):
            if stop.is_set() or lost.is_set():
                return
            live = job["engine"].get("kind") == "openai"
            if live:
                base, key = credentials(db_engine, job)
            with Session(db_engine) as db, db.begin():
                turn = locked_turn(db, job)
                if not turn:
                    return
                if turn.attempts >= MAX_ATTEMPTS:
                    raise InferenceError("ATTEMPT_LIMIT", "최대 3회 호출했습니다. 새 질문을 보내세요.")
                turn.attempts += 1
            failure = None
            try:
                if live:
                    answer, usage = generate_interview(base, key, job)
                else:
                    q = next((q for q in job["survey"]["questions"] if q["id"] in job["prior"] and
                        (not job["question_id"] or q["id"] == job["question_id"])), None)
                    answer = "[시연 인터뷰] 저장된 응답: " + display_answer(q, job["prior"][q["id"]])
                    usage = {"input_tokens": 0, "output_tokens": 0}
            except InferenceError as error:
                failure, usage = error, error.usage
            with Session(db_engine) as db, db.begin():
                turn = db.scalar(select(InterviewTurn).where(InterviewTurn.id == job["turn_id"]).with_for_update())
                # Usage belongs to this issued call even if cancelled while waiting.
                turn.input_tokens += usage.get("input_tokens", 0)
                turn.output_tokens += usage.get("output_tokens", 0)
                if failure and failure.code == "OPENAI_NETWORK":
                    turn.unknown_attempts += 1
                if turn.status != "running" or turn.lease_token != job["token"] or turn.lease_until < now():
                    return
                if not failure:
                    turn.answer, turn.status = answer, "completed"
                    turn.updated, turn.lease_token, turn.lease_until = now(), None, None
                    return
            if failure.retryable and retry_number == 0:
                if stop.wait(2) or lost.is_set():
                    return
                continue
            raise failure
    except (ApiError, InferenceError) as error:
        with Session(db_engine) as db, db.begin():
            turn = locked_turn(db, job)
            if turn:
                turn.status, turn.error, turn.error_code = "failed", error.message, error.code
                turn.updated, turn.lease_token, turn.lease_until = now(), None, None
    finally:
        finished.set()
        keeper.join(timeout=6)
