"""Compact browser profiles; immutable source snapshots remain complete."""
import json
from pathlib import Path

_schema = json.loads((Path(__file__).resolve().parents[2] / "src/data/personaSchema.json").read_text())
SUMMARY_KEYS = {f["key"] for f in _schema["fields"] if f["type"] != "text"} | {"occupation", "district", "ageYears"}


def public_people(people):
    if len(people) <= 500:
        return people
    return [{**p, "compact": True, "attributes": {k: v for k, v in p["attributes"].items() if k in SUMMARY_KEYS}} for p in people]


def public_cohort(cohort):
    return {**cohort, "people": public_people(cohort["people"])} if cohort else None
