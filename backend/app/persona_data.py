"""Read-only Parquet queries. The only file path comes from server configuration."""
import copy
import hashlib
import json
import threading
from collections import OrderedDict
from contextlib import contextmanager
from pathlib import Path

import duckdb

from .config import settings
from .errors import ApiError

SCHEMA_PATH = Path(__file__).resolve().parents[2] / "src/data/personaSchema.json"
BIG5 = {"openness", "conscientiousness", "extraversion", "agreeableness", "neuroticism"}
_lock = threading.Lock()
_slots = threading.BoundedSemaphore(2)
_current = None


def file_stamp(path):
    try:
        s = path.stat()
        return (str(path), s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns)
    except OSError:
        raise ApiError(503, "DATASET_UNAVAILABLE", "페르소나 원본 파일에 접근할 수 없습니다. 서버 경로를 확인하세요.") from None


@contextmanager
def query_slot():
    if not _slots.acquire(timeout=1):
        raise ApiError(503, "DATASET_BUSY", "원본을 조회 중입니다. 잠시 후 다시 시도하세요.")
    try:
        yield
    finally:
        _slots.release()


class Dataset:
    def __init__(self, path, stamp):
        self.path, self.stamp = path, stamp
        self.counts = OrderedDict()
        self.count_lock = threading.Lock()
        h = hashlib.sha256()
        with path.open("rb") as f:
            for block in iter(lambda: f.read(8 * 1024 * 1024), b""):
                h.update(block)
        self.id = "parquet-" + h.hexdigest()
        with self.connect() as con:
            columns = {r[0] for r in con.execute("DESCRIBE raw").fetchall()}
            if not {"uuid", "age", "region", "district"}.issubset(columns):
                raise ApiError(422, "INVALID_DATASET", "원본에 uuid·age·region·district 컬럼이 필요합니다.")
            total, unique, missing, bad_age = con.execute("""
                SELECT count(*), count(DISTINCT uuid),
                count(*) FILTER (WHERE uuid IS NULL OR trim(uuid) = ''),
                count(*) FILTER (WHERE age IS NULL OR try_cast(age AS INTEGER) IS NULL
                    OR age < 0 OR age > 130 OR age != floor(age))
                FROM raw
            """).fetchone()
            if not total or total != unique or missing or bad_age:
                raise ApiError(422, "INVALID_DATASET", "원본 UUID의 중복·결측 또는 나이 값을 확인하세요.")
            catalog = json.loads(SCHEMA_PATH.read_text())
            fields = []
            for original in catalog["fields"]:
                key = original["key"]
                if key not in columns:
                    continue
                f = copy.deepcopy(original)
                f["nonnull"] = con.execute(f'SELECT count("{key}") FROM people').fetchone()[0]
                if f["type"] != "text":
                    rows = con.execute(f'SELECT "{key}", count(*) FROM people WHERE "{key}" IS NOT NULL GROUP BY 1 ORDER BY 1').fetchall()
                    f["options"] = []
                    for value, count in rows:
                        label = str(value)
                        if key in BIG5:
                            try:
                                obj = json.loads(value)
                                score = obj["t_score"]
                                if type(score) is not int or not 20 <= score <= 80 or not isinstance(obj["label"], str):
                                    raise ValueError()
                                label = f'{score}점 · {obj["label"]}'
                            except (ValueError, TypeError, KeyError):
                                raise ApiError(422, "INVALID_DATASET", "원본 성격 점수의 형식을 확인하세요.") from None
                        f["options"].append(dict(value=str(value), label=label, count=count))
                fields.append(f)
            self.fields = {f["key"]: f for f in fields}
            districts = [dict(region=r, district=d, count=n) for r, d, n in con.execute("""
                SELECT region, district, count(*) FROM people
                WHERE region IS NOT NULL AND district IS NOT NULL GROUP BY 1, 2 ORDER BY 1, 2
            """).fetchall()]
        self.catalog = dict(id=self.id, source=path.name, total=total, columns=len(columns),
            country="대한민국", fields=fields, regionDistricts=districts, unavailable=catalog.get("unavailable", []))
        self.assert_unchanged()

    @contextmanager
    def connect(self):
        con = duckdb.connect(":memory:", config={"threads": 2, "memory_limit": "512MB", "max_temp_directory_size": "0B"})
        try:
            con.read_parquet(str(self.path)).create_view("raw")
            con.execute("""CREATE VIEW people AS SELECT * EXCLUDE(age),
                age AS "ageYears", cast(cast(floor(age / 10) * 10 AS INTEGER) AS VARCHAR) || '대' AS age
                FROM raw""")
            yield con
        except duckdb.Error:
            raise ApiError(503, "DATASET_QUERY_FAILED", "페르소나 원본 조회에 실패했습니다. 파일 형식과 서버 자원을 확인하세요.") from None
        finally:
            con.close()

    def assert_unchanged(self):
        if file_stamp(self.path) != self.stamp:
            raise ApiError(409, "DATASET_CHANGED", "원본 파일이 변경되었습니다. 목록을 다시 불러오세요.")

    def predicate(self, filters):
        if len(filters) > len(self.fields):
            raise ApiError(422, "INVALID_FILTER", "지원하지 않는 조건입니다.")
        parts, params = [], []
        for key, values in sorted(filters.items()):
            f = self.fields.get(key)
            if not f or len(values) > 5000 or any(len(v) > 2000 for v in values):
                raise ApiError(422, "INVALID_FILTER", "조건 항목 또는 값이 올바르지 않습니다.")
            if not values:
                continue
            # Column identifiers come exclusively from the server catalog; values are bound parameters.
            if f["type"] == "text":
                if len(values) > 50 or any(not v.strip() for v in values):
                    raise ApiError(422, "INVALID_FILTER", "서술 검색어는 빈 값 없이 50개까지 입력하세요.")
                parts.append("(" + " OR ".join([f'contains(lower(coalesce("{key}", \'\')), lower(?))'] * len(values)) + ")")
                params.extend(values)
            elif key == "region":
                known_regions = {o["value"] for o in f["options"]}
                known_districts = {(d["region"], d["district"]) for d in self.catalog["regionDistricts"]}
                ors = []
                for value in values:
                    if "::" in value:
                        r, d = value.split("::", 1)
                        if (r, d) not in known_districts:
                            raise ApiError(422, "INVALID_FILTER", "원본에 없는 지역 조건입니다.")
                        ors.append("(region = ? AND district = ?)")
                        params.extend([r, d])
                    else:
                        if value not in known_regions:
                            raise ApiError(422, "INVALID_FILTER", "원본에 없는 지역 조건입니다.")
                        ors.append("region = ?")
                        params.append(value)
                parts.append("(" + " OR ".join(ors) + ")")
            elif key in BIG5:
                try:
                    scores = sorted({json.loads(v)["t_score"] for v in values})
                    if any(type(s) is not int or not 20 <= s <= 80 for s in scores):
                        raise ValueError()
                except (ValueError, KeyError, TypeError):
                    raise ApiError(422, "INVALID_FILTER", "성격 점수 조건이 올바르지 않습니다.") from None
                parts.append(f"""cast(json_extract_string("{key}", '$.t_score') AS INTEGER) IN ({','.join('?' for _ in scores)})""")
                params.extend(scores)
            else:
                if not set(values).issubset({o["value"] for o in f["options"]}):
                    raise ApiError(422, "INVALID_FILTER", "원본에 없는 조건 값입니다. 조건 목록을 다시 확인하세요.")
                parts.append(f'"{key}" IN ({",".join("?" for _ in values)})')
                params.extend(values)
        return " AND ".join(parts) or "TRUE", params

    def count(self, filters):
        where, params = self.predicate(filters)
        key = json.dumps([where, params], ensure_ascii=False)
        self.assert_unchanged()
        with self.count_lock:
            if key in self.counts:
                self.counts.move_to_end(key)
                return self.counts[key]
        with self.connect() as con:
            n = con.execute("SELECT count(*) FROM people WHERE " + where, params).fetchone()[0]
        self.assert_unchanged()
        with self.count_lock:
            self.counts[key] = n
            if len(self.counts) > 256:
                self.counts.popitem(last=False)
        return n

    def sample(self, filters, count, seed):
        self.assert_unchanged()
        where, params = self.predicate(filters)
        matched = self.count(filters)
        if matched < count:
            raise ApiError(422, "INSUFFICIENT_PERSONAS", f"조건에 맞는 원본은 {matched:,}명입니다. 요청 인원을 줄이거나 조건을 변경하세요.")
        with self.connect() as con:
            ids = [r[0] for r in con.execute(
                "SELECT uuid FROM people WHERE " + where + " ORDER BY sha256(uuid || ?), uuid LIMIT ?",
                [*params, seed, count]).fetchall()]
            result = con.execute("SELECT * FROM people WHERE uuid IN (" + ",".join("?" for _ in ids) + ")", ids)
            keys = [c[0] for c in result.description]
            by_id = {r["uuid"]: r for r in (dict(zip(keys, row)) for row in result.fetchall())}
        self.assert_unchanged()
        return [dict(id=f"P-{i + 1:03}", sourceRecordId=source_id, attributes=by_id[source_id])
                for i, source_id in enumerate(ids)], matched


def dataset():
    global _current
    if not settings.parquet_path:
        raise ApiError(503, "DATASET_NOT_CONFIGURED", "서버에 페르소나 Parquet 경로를 설정하세요.")
    path = Path(settings.parquet_path).expanduser().resolve()
    stamp = file_stamp(path)
    with _lock:
        if _current is None or _current.stamp != stamp:
            try:
                _current = Dataset(path, stamp)
            except OSError:
                raise ApiError(503, "DATASET_UNAVAILABLE", "페르소나 원본을 읽을 수 없습니다.") from None
        return _current
