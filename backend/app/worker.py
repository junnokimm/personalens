"""Durable demo/OpenAI worker. Run separately: python -m app.worker."""
import argparse
import copy
import logging
import signal
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from uuid import uuid4

from sqlalchemy import and_, case, exists, func, or_, select
from sqlalchemy.orm import Session

from .database import engine
from .models import Response, Run, RunTask, InferenceAttempt
from .errors import ApiError
from .inference import credentials, generate, InferenceError
from .runs import ACTIVE, now
from .snapshots import digest

log = logging.getLogger("persona.worker")


def recalculate(session, run):
    session.flush()
    n = len(run.survey["questions"])
    succeeded, failed, active = session.execute(select(func.sum(RunTask.next_question),
        func.sum(case((RunTask.status == "failed", n - RunTask.next_question), else_=0)),
        func.count().filter(RunTask.status.in_(ACTIVE))).where(RunTask.run_id == run.id)).one()
    run.succeeded, run.failed = succeeded or 0, failed or 0
    run.updated = now()
    if not active:
        run.status = "completed" if not run.failed else "partial_failed" if run.succeeded else "failed"
        run.finished = now()
        run.fail_note = f"응답 {run.failed}개 생성 실패 · 성공 응답을 유지하고 실패한 작업만 재시도할 수 있습니다." if run.failed else ""
        if run.failed:
            errors = session.scalars(select(RunTask.error).where(RunTask.run_id == run.id, RunTask.status == "failed").limit(5))
            run.fail_note += " " + " / ".join(dict.fromkeys(e for e in errors if e))[:600]


def claim(db_engine, lease_seconds=30):
    with Session(db_engine, expire_on_commit=False) as session, session.begin():
        eligible = or_(RunTask.status == "queued", and_(RunTask.status == "running", RunTask.lease_until < now()))
        # Every write locks run -> task in this order, including cancel/retry. No lock during generation.
        run = session.scalar(select(Run).where(Run.status.in_(ACTIVE),
            exists().where(RunTask.run_id == Run.id, eligible))
            .order_by(Run.created).with_for_update(skip_locked=True).limit(1))
        if run is None:
            return None
        task = session.scalar(select(RunTask).where(RunTask.run_id == run.id, eligible)
            .order_by(RunTask.person_index).with_for_update(skip_locked=True).limit(1))
        if task is None:
            return None
        if task.attempts >= 3:
            task.status, task.error = "failed", "워커가 반복적으로 중단되어 자동 재개 한도를 초과했습니다."
            task.lease_token = task.lease_until = None
            recalculate(session, run)
            return None
        task.status, task.attempts = "running", task.attempts + 1
        task.lease_token, task.lease_until = str(uuid4()), now() + timedelta(seconds=lease_seconds)
        run.status, run.updated = "running", now()
        prior = {r.question_id: copy.deepcopy(r.payload) for r in session.scalars(
            select(Response).where(Response.run_id == run.id, Response.persona_id == task.persona_id))}
        return dict(run_id=run.id, persona_id=task.persona_id, token=task.lease_token,
            index=task.next_question, fail_once=task.fail_once, prior=prior,
            person=session.scalar(select(Run.group_snapshot["cohort"]["people"][task.person_index]).where(Run.id == run.id)),
            survey=copy.deepcopy(run.survey), seed=run.engine["seed"], engine=copy.deepcopy(run.engine), project_id=run.project_id)


def locked_job(session, job):
    run = session.scalar(select(Run).where(Run.id == job["run_id"]).with_for_update())
    task = session.scalar(select(RunTask).where(RunTask.run_id == job["run_id"],
        RunTask.persona_id == job["persona_id"]).with_for_update())
    if (not run or not task or run.status not in ACTIVE or task.status != "running"
            or task.lease_token != job["token"] or task.lease_until is None or task.lease_until <= now()):
        return None, None
    return run, task


def renew(db_engine, job, lease_seconds):
    with Session(db_engine) as session, session.begin():
        run, task = locked_job(session, job)
        if task is None:
            return False
        task.lease_until = now() + timedelta(seconds=lease_seconds)
        return True


def save_answer(db_engine, job, position, payload, lease_seconds=30, attempt_id=None, usage=None):
    with Session(db_engine) as session, session.begin():
        run, task = locked_job(session, job)
        if task is None or task.next_question != position:
            return False
        question = run.survey["questions"][position]
        if payload["questionId"] != question["id"] or payload["personaId"] != task.persona_id:
            raise ValueError("Response does not belong to this task")
        n = question["scale"] if question["type"] == "likert" else len(question["options"]) + int(question["otherEnabled"])
        if question["type"] == "text":
            if payload.get("answer") is not None or not payload.get("text", "").strip():
                raise ValueError("Invalid text answer")
        elif type(payload.get("answer")) is not int or not 0 <= payload["answer"] < n:
            raise ValueError("Invalid zero-based answer")
        session.add(Response(run_id=run.id, persona_id=task.persona_id, question_id=question["id"], payload=payload))
        if attempt_id:
            attempt = session.get(InferenceAttempt, attempt_id)
            attempt.status = "succeeded"
            attempt.input_tokens, attempt.output_tokens = usage["input_tokens"], usage["output_tokens"]
        task.next_question += 1
        task.lease_until = now() + timedelta(seconds=lease_seconds)
        if task.next_question == len(run.survey["questions"]):
            task.status, task.lease_token, task.lease_until = "succeeded", None, None
        recalculate(session, run)
        return True


def fail_job(db_engine, job, message, consume_demo_failure=False):
    with Session(db_engine) as session, session.begin():
        run, task = locked_job(session, job)
        if task is None:
            return
        task.status, task.error = "failed", message
        task.lease_token = task.lease_until = None
        if consume_demo_failure:
            task.fail_once = False
        recalculate(session, run)


def demo_answer(job, question):
    person = job["person"]
    attrs = person["attributes"]
    parent = job["prior"].get(question["parentId"])
    fingerprint = bytes.fromhex(digest([job["seed"], person["id"], question["id"], parent]))
    payload = {"personaId": person["id"], "questionId": question["id"], "answer": None, "text": "", "otherText": ""}
    if question["type"] == "text":
        payload["text"] = f'[시연 응답] {attrs.get("age", "연령 미상")} {attrs.get("sex", "")}의 관점에서 “{question["text"]}”에 답하는 예시입니다.'
    else:
        n = question["scale"] if question["type"] == "likert" else len(question["options"]) + int(question["otherEnabled"])
        payload["answer"] = int.from_bytes(fingerprint[:8], "big") % n
        if question["type"] == "choice" and payload["answer"] == len(question["options"]):
            payload["otherText"] = "[시연 응답] 다른 선택 방식을 원합니다."
    return payload


def process(db_engine, job, *, delay=0.05, lease_seconds=30, stop=None):
    stop = stop or threading.Event()
    if job.get("engine", {}).get("kind") == "openai":
        return process_openai(db_engine, job, lease_seconds=lease_seconds, stop=stop)
    for position in range(job["index"], len(job["survey"]["questions"])):
        if stop.is_set() or not renew(db_engine, job, lease_seconds):
            return
        if job["fail_once"] and position == min(1, len(job["survey"]["questions"]) - 1):
            fail_job(db_engine, job, "요청한 실패 시연", consume_demo_failure=True)
            return
        if stop.wait(delay):
            return
        question = job["survey"]["questions"][position]
        answer = demo_answer(job, question)
        if not save_answer(db_engine, job, position, answer, lease_seconds):
            return
        job["prior"][question["id"]] = answer


def reserve_attempt(db_engine, job, question):
    with Session(db_engine) as session, session.begin():
        run, task = locked_job(session, job)
        if task is None:
            return None
        attempts = list(session.scalars(select(InferenceAttempt).where(InferenceAttempt.run_id == run.id,
            InferenceAttempt.persona_id == task.persona_id, InferenceAttempt.question_id == question["id"])))
        if any(a.status == "started" for a in attempts):
            raise InferenceError("INTERRUPTED_REQUEST", "이전 호출의 완료 여부를 알 수 없습니다. OpenAI 사용 내역 확인 후 재시도하세요.")
        if len(attempts) >= run.engine["maxAttemptsPerAnswer"]:
            raise InferenceError("ATTEMPT_LIMIT", "이 응답의 최대 호출 횟수에 도달했습니다. 설정을 확인한 뒤 새 실행을 시작하세요.")
        attempt = InferenceAttempt(id=str(uuid4()), run_id=run.id, persona_id=task.persona_id,
            question_id=question["id"], status="started", input_tokens=0, output_tokens=0, error_code="", created=now())
        session.add(attempt)
        return attempt.id


def finish_attempt(db_engine, attempt_id, status, error_code="", usage=None):
    with Session(db_engine) as session, session.begin():
        attempt = session.get(InferenceAttempt, attempt_id)
        if attempt and attempt.status == "started":
            attempt.status, attempt.error_code = status, error_code
            if usage:
                attempt.input_tokens, attempt.output_tokens = usage["input_tokens"], usage["output_tokens"]


def process_openai(db_engine, job, *, lease_seconds, stop):
    finished, lost = threading.Event(), threading.Event()
    def heartbeat():
        while not finished.wait(min(5, lease_seconds / 3)):
            try:
                if not renew(db_engine, job, lease_seconds):
                    lost.set(); return
            except Exception:
                lost.set(); return
    if stop.is_set() or not renew(db_engine, job, lease_seconds):
        return
    keeper = threading.Thread(target=heartbeat, daemon=True)
    keeper.start()
    try:
        for position in range(job["index"], len(job["survey"]["questions"])):
            question = job["survey"]["questions"][position]
            for retry_number in range(2):
                if stop.is_set() or lost.is_set():
                    return
                base, key = credentials(db_engine, job)
                attempt_id = reserve_attempt(db_engine, job, question)
                if not attempt_id:
                    return
                try:
                    answer, usage = generate(base, key, job, question)
                except InferenceError as error:
                    finish_attempt(db_engine, attempt_id, "failed", error.code, error.usage)
                    if error.retryable and retry_number == 0:
                        if stop.wait(2) or lost.is_set():
                            return
                        continue
                    raise
                if not save_answer(db_engine, job, position, answer, lease_seconds, attempt_id, usage):
                    finish_attempt(db_engine, attempt_id, "discarded", usage=usage)
                    return
                job["prior"][question["id"]] = answer
                break
    except (InferenceError, ApiError) as error:
        fail_job(db_engine, job, error.message)
    finally:
        finished.set()
        keeper.join(timeout=6)


def work(db_engine, stop, *, delay, lease_seconds):
    from .interviews import claim_interview, process_interview
    while not stop.is_set():
        try:
            interview = claim_interview(db_engine, lease_seconds)
            if interview:
                process_interview(db_engine, interview, lease_seconds=lease_seconds, stop=stop)
                continue
            job = claim(db_engine, lease_seconds)
            if job is None:
                stop.wait(0.25)
                continue
            try:
                process(db_engine, job, delay=delay, lease_seconds=lease_seconds, stop=stop)
            except ValueError:
                log.exception("Invalid demo response")
                fail_job(db_engine, job, "응답 형식 검증 실패")
        except Exception:
            # DB/process interruptions leave a durable lease; another worker can reclaim it.
            log.exception("Worker interrupted; the job will be reclaimed after lease expiry")
            stop.wait(1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--concurrency", type=int, default=4)
    parser.add_argument("--demo-delay", type=float, default=0.05)
    parser.add_argument("--lease-seconds", type=float, default=30)
    args = parser.parse_args()
    if args.concurrency < 1 or args.demo_delay < 0 or args.lease_seconds <= args.demo_delay + 1:
        parser.error("concurrency >= 1, delay >= 0, lease > delay + 1 required")
    logging.basicConfig(level=logging.INFO)
    stop = threading.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: stop.set())
    log.info("Survey/interview worker started (%s threads)", args.concurrency)
    with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        futures = [pool.submit(work, engine, stop, delay=args.demo_delay, lease_seconds=args.lease_seconds) for _ in range(args.concurrency)]
        for future in futures:
            future.result()


if __name__ == "__main__":
    main()
