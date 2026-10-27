import hashlib
import json
from sqlalchemy import select

from .models import SurveyVersion


def content(survey):
    return {key: survey[key] for key in ("title", "description", "questions")}


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()


def versions(session, project_id):
    return list(session.scalars(select(SurveyVersion).where(SurveyVersion.project_id == project_id).order_by(SurveyVersion.version)))


def survey_state(rows):
    return {"version": rows[-1].version if rows else 0,
            "history": [{**v.document, "version": v.version, "created": v.created.isoformat()} for v in rows]}


def current_survey(session, project):
    rows = versions(session, project.id)
    return {**content(project.survey), **survey_state(rows),
            "draft": not rows or digest(content(project.survey)) != rows[-1].content_hash}
