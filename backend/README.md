# PersonaLens 백엔드 · 저장·시연 실행·모델 연결 MVP

기존 React/Zustand 편집기와 결과 분석 화면을 유지하면서 설계, 실행 스냅샷, 작업 상태, 시연 응답을 PostgreSQL에 저장한다. API와 별도 프로세스인 워커가 응답을 생성하므로 브라우저를 닫아도 실행이 계속된다. 로그인·개인/공용 모델 연결·모델 목록 조회와 선택 저장을 지원한다. **실제 LLM 응답 생성은 아직 연결하지 않았으며 워커는 시연 응답만 만든다.**

## 실행

필요 도구: Node.js, Python 3.12 이상, uv, PostgreSQL 18. Python 패키지는 `pyproject.toml`과 `uv.lock`으로 고정한다.

저장소 루트에서:

```sh
npm ci
bash scripts/dev-db.sh start
cd backend
uv sync --locked --python 3.12
uv run python scripts/init_secrets.py
uv run alembic upgrade head
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

다른 터미널에서 저장소 루트의 `npm run dev`를 실행하고 http://127.0.0.1:5173 을 연다. Vite 개발 서버와 preview 서버는 `/api`를 로컬 API 서버(8000)로 전달한다. API 문서는 http://127.0.0.1:8000/docs 에서 확인한다.

응답을 처리할 워커는 **또 다른 터미널**에서 실행한다:

```sh
cd backend
uv run python -m app.worker
# 선택: --concurrency 4 --demo-delay 0.05 --lease-seconds 30
```

워커가 없으면 실행은 `queued`로 DB에 남는다. 실행을 계속하려면 DB와 워커가 켜져 있어야 한다. 컴퓨터가 꺼진 동안에는 처리하지 않으며, 다시 실행하면 미완료 작업을 이어서 처리한다. 워커를 강제 종료했을 때에는 기본 30초 임대가 만료된 뒤 다른 워커가 인계한다. API 프로세스나 브라우저가 종료되어도 실행 중인 워커는 DB에 계속 응답을 저장한다.

개발 DB는 `.runtime/postgres/`에 보관되며 Git에서 제외한다. 포트는 55432이고 기존 시스템 PostgreSQL과 분리되어 있다. 다른 PostgreSQL 설치를 쓰면 `PG_BIN`을 해당 `bin` 경로로 지정한다. 중지: 저장소 루트에서 `bash scripts/dev-db.sh stop`. 데이터는 지우지 않는다.

기존 DB를 사용하려면 `backend/.env`에 `.env.example` 형식의 `PERSONA_DATABASE_URL`을 설정한다. 스키마는 서버 시작 시 자동 생성하지 않으며 Alembic으로 적용한다.

첫 접속 시 관리자 계정을 만든다. 기존 프로젝트·설문·집단·실행은 첫 관리자 계정에 귀속되며 삭제하지 않는다. 이후 팀원은 ‘모델 연결 → 팀원 계정 등록’에서 관리자가 만든 계정으로 로그인한다. 프로젝트와 실행 결과는 소유자만 접근한다. 개인 연결은 소유자만, 공용 연결은 로그인한 팀원이 사용할 수 있고 공용 연결 수정·모델 조회는 관리자만 가능하다.

이 개발 DB는 **로컬 전용 trust 인증**이다. 서버는 127.0.0.1에 바인딩한다. 공유 배포 시 HTTPS, `PERSONA_COOKIE_SECURE=true`, 실제 origin 허용 목록, DB 인증·백업, 서버 암호화 키 관리가 필요하다. 현재 로그인 제한은 API 프로세스별 1분에 20회이며, 계정 복구/SSO/공유 rate limiter는 후속 범위다.

## 모델 연결과 선택

상단 **모델 연결 → 연결 등록 → 연결 확인 · 모델 조회**를 거친 뒤 기존 **설계 → 응답 모델**에서 연결과 모델을 고른다. 모델을 선택하면 `{connectionId, modelId}`만 프로젝트 자동 저장에 포함된다. 키와 서버 주소는 실행 스냅샷에 들어가지 않는다. `engine.selectedModel`은 실행 시점 선택 참고값이며, 실제 사용 엔진은 계속 `demo`다.

| 공급자 | 등록 정보 | 조회 방식 |
| --- | --- | --- |
| OpenAI | 이름, API 키, 개인/공용 | 공식 `/v1/models`, Bearer 인증. 일반 텍스트 모델 계열을 표시하고 알려진 특수 출력 모델을 제외 |
| Anthropic | 이름, API 키, 개인/공용 | 공식 `/v1/models`, `x-api-key`, `anthropic-version: 2023-06-01`. `after_id` 페이지 처리 |
| DGX Spark | 이름, API 기본 주소, 선택적 키, 개인/공용 | OpenAI 호환 `/models`. GLM·Qwen 등 실제 서버에 로드된 모델 ID를 사용. 목록 API가 없으면 ID 직접 등록 |

DGX는 하드웨어 이름이며 이 앱이 모델 서버를 설치하지 않는다. 관리자 환경 변수 `PERSONA_DGX_ALLOWED_BASE_URLS`에 API 서버가 접근 가능한 **정확한 기본 주소**를 추가한다(예: `["http://spark.lab:8000/v1"]`). 임의 주소로 키가 전달되지 않도록 허용 목록을 매 조회마다 검사하고 리다이렉트는 따르지 않는다. OpenAI·Anthropic 주소는 서버에서 고정한다.

키는 `cryptography`의 Fernet으로 암호화해 DB에 보관한다. `PERSONA_ENCRYPTION_KEY`는 DB와 분리한 비밀이며 `.env`는 Git에서 제외한다. 초기화 스크립트는 기존 키를 교체하지 않는다. 키를 잃으면 저장된 API 키를 복호화할 수 없으므로 별도로 안전하게 백업한다. UI/API 응답에는 `hasKey`만 반환한다. 수정 시 `apiKey` 생략 또는 `null`은 기존 값 유지, 새 문자열은 교체, 빈 문자열은 제거(DGX만 허용)다. 공급자나 공유 범위 변경은 새 연결로 등록한다. 사용 중지는 수정 화면에서 가능하며 기존 기록은 보존한다.

`ready`는 모델 목록 조회 성공을 뜻하며 추론 가능 여부·요금·모델별 출력 기능까지 검증한 상태가 아니다. `manual`은 실행 검증 전 직접 등록이다. 주소·키·활성화 설정이 바뀌면 캐시를 무효화한다. 실패·비활성·목록에서 사라진 모델은 새로 선택할 수 없으며 기존 선택에 경고를 표시한다. 조회는 요청당 5초, Anthropic 최대 2페이지, 응답 최대 2MB로 제한한다. 더 큰 목록은 오류로 알리고 부분 목록을 확정하지 않는다.

## 실제 키 없는 모의 서버 검증

별도 터미널에서 `backend` 기준:

```sh
uv run python -m app.mock_provider
```

API를 다음 설정으로 실행한다(같은 8000 포트의 기존 API는 먼저 중지):

```sh
PERSONA_MOCK_PROVIDER_BASE_URL=http://127.0.0.1:8001 \
PERSONA_DGX_ALLOWED_BASE_URLS='["http://127.0.0.1:8001/dgx/v1"]' \
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

| 연결 | 가짜 API 키 | 조회되는 테스트 모델 |
| --- | --- | --- |
| OpenAI | `fake-openai-test` | `gpt-demo-small`, `gpt-demo-large` |
| Anthropic | `fake-anthropic-test` | `claude-demo-sonnet`, `claude-demo-haiku` (2페이지) |
| DGX Spark | `fake-dgx-test` 또는 키 없음 | `Qwen/demo-8B`, `GLM/demo-9B` |

DGX 기본 주소는 `http://127.0.0.1:8001/dgx/v1`이다. 모의 모드 UI는 이를 명시하고 OpenAI·Anthropic에 `fake-`로 시작하지 않는 키를 거부한다. 모의 서버는 모델 목록 GET만 구현하며 추론 요청이나 외부 네트워크 요청을 하지 않는다. 공식 공급자를 조회하려면 모의 환경 변수를 비우고 새 연결을 등록한다. 모의 서버 연결은 공식 주소로 자동 전환하지 않는다.

## 데이터 계약과 저장 구조

| 테이블 | 내용 |
| --- | --- |
| `projects` | ID·이름·설명, 설문 JSONB, 선택한 집단·모델, 수정 번호, 마지막 저장 요청 ID/해시, 서버 갱신 시각 |
| `target_groups` | 프로젝트별 집단 ID·순서·이름·인원·필터 JSONB·구성된 시연 프로필 JSONB |
| `survey_versions` | 실행할 때 확정한 설문 내용·버전·해시. DB 트리거로 수정·삭제 금지 |
| `runs` | 실행 번호·접수 ID, 설문·집단·페르소나·시연 생성기 스냅샷, 상태·성공/실패 수 |
| `run_tasks` | 실행×페르소나 작업, 다음 문항 위치, 시도 횟수, 임대 토큰·만료 시각 |
| `responses` | 실행×페르소나×문항별 응답. 복합 기본키로 중복 저장 방지 |
| `users` | 아이디·이름·scrypt 비밀번호 해시·관리자 여부 |
| `auth_sessions` | 세션 토큰의 SHA-256 해시·사용자·7일 만료 시각 |
| `model_connections` | 소유자·개인/공용·공급자·기본 주소·암호화 키·활성 상태·모델 캐시·조회 상태·수정 번호 |

문항의 `id/type/parentId/text/options/otherEnabled/scale/low/high`와 기존 `survey/groups/activeGroupId/model` 구조를 유지한다. `count: null`, 빈 설문 제목·문항·선택지 등 **미완성 초안도 저장**한다. 인원 초안은 입력창 범위인 0~9999를 허용하고 기존 프론트의 구성 검증은 10~500을 유지한다. 잘못된 참조, 중복 ID, 없는 활성 집단, 마지막 집단 삭제는 거부한다.

이번 단계의 저장 단위는 **프로젝트 하나의 설계 전체**이다. 설문·집단·선택 상태를 한 트랜잭션에서 저장하고 프로젝트 수정 번호로 충돌을 검사한다. 이를 통해 기존 동기식 Zustand 편집 액션을 유지하고, 집단 삭제와 활성 집단 변경 사이의 불일치를 피한다. 앞서 검토한 개별 설문·집단 API는 실제 실행을 분리하는 후속 단계에서 필요에 따라 추가한다.

API 키, 응답·인터뷰, 화면 상태는 설계 저장 요청 본문에 넣지 않는다. 새 실행과 응답은 서버 DB에서 복원한다. 로컬 시연 기록·인터뷰와 미저장 초안·접수 재시도 ID는 사용자 ID로 저장 공간을 구분한다. 이전 사용자 미구분 서버 outbox/cache는 자동 복원하지 않는다. 설문 `version/history/draft`는 서버에서 확정된 설문 버전으로 계산하며 클라이언트가 보낸 버전 정보는 신뢰하지 않는다. 구성된 페르소나는 현재 프론트에서 만든 시연 프로필이며 원자료 추출이 아니다.

실행 접수 시 프로젝트 행을 잠그고 저장 수정 번호를 검사한 뒤, 설문 버전과 집단 스냅샷·작업을 한 트랜잭션에서 생성한다. 설문 내용이 직전 버전과 같으면 버전을 재사용한다. 이후 초안을 수정하거나 대상집단을 변경·삭제해도 기존 실행은 영향을 받지 않는다. 실행의 입력 스냅샷은 DB 트리거로 변경을 금지한다.

## API

인증은 `HttpOnly`, `SameSite=Strict`, `/api` 범위의 쿠키를 사용한다. API 변경 요청에는 `X-Persona-Request: 1`이 필요하고 브라우저 Origin은 허용 목록과 비교한다. 프론트는 `X-Persona-User`도 보내 다른 탭에서 계정이 바뀐 경우 저장을 차단한다. 세션 만료/계정 변경 시 새로고침·재로그인을 안내한다. 비밀번호·키를 오류 본문이나 로그에 포함하지 않는다.

| 메서드 | 경로 | 요청 / 응답 |
| --- | --- | --- |
| GET | `/api/v1/auth/session` | `{user, needsSetup}` |
| POST | `/api/v1/auth/setup` | 최초 1회 `{username, password, name}` → 관리자 생성, 기존 데이터 귀속, 로그인 |
| POST | `/api/v1/auth/login` | `{username, password}` → 세션 쿠키 |
| POST | `/api/v1/auth/logout` | 세션 폐기 |
| POST | `/api/v1/auth/users` | 관리자만 `{username, password, name}` → 일반 팀원 생성 |
| GET | `/api/v1/connections` | 접근 가능한 연결 메타데이터·모델 캐시·허용 DGX 주소·모의 모드 여부 |
| POST | `/api/v1/connections` | `ConnectionWrite` → 201, 암호화 저장 |
| PUT | `/api/v1/connections/{id}` | `ConnectionWrite` → 200, `expectedRevision` 충돌 시 409 |
| POST | `/api/v1/connections/{id}/check` | 모델 조회 → 연결 메타데이터. 실패도 200의 `status:error,lastError`로 저장, 동시 수정 시 409 |

`ConnectionWrite`: `{name, provider: "openai"|"anthropic"|"dgx", scope: "private"|"shared", baseUrl?, apiKey?, enabled?, expectedRevision?, manualModelIds?}`. 생성 수정 번호는 0, 이후 GET/PUT/check 응답의 `revision`을 쓴다. `manualModelIds`는 DGX 전용이다. 연결 응답에는 `{id,name,provider,scope,baseUrl,hasKey,enabled,revision,models:[{id,name,source}],status,lastError,checkedAt,canEdit,updated}`가 포함된다. API 키 재조회 API는 없다.

| 메서드 | 경로 | 요청 / 응답 |
| --- | --- | --- |
| GET | `/api/v1/health` | DB 연결 확인 |
| GET | `/api/v1/projects` | `{projects: ProjectResponse[]}` |
| GET | `/api/v1/projects/{id}` | 프로젝트 한 개, 없으면 404 |
| POST | `/api/v1/projects` | `SaveProject` → 201, 새 프로젝트 |
| PUT | `/api/v1/projects/{id}` | `SaveProject` → 200, 전체 설계 원자적 저장 |
| POST | `/api/v1/projects/{id}/runs` | `StartRun` → 202, 스냅샷 확정 및 작업 접수 |
| GET | `/api/v1/projects/{id}/runs` | `{runs: RunSummary[], surveyState: {version, history}}` |
| GET | `/api/v1/runs/{id}` | 상태·진행률·응답 수·고정 설계 요약 |
| GET | `/api/v1/runs/{id}/result` | 실행 요약 + `people`, `responses`; 부분 응답도 조회 가능 |
| POST | `/api/v1/runs/{id}/retry` | 202, 실패 작업만 같은 스냅샷으로 재접수 |
| POST | `/api/v1/runs/{id}/cancel` | 202, 미완료 작업 취소. 저장된 응답 유지 |

```json
{
  "expectedRevision": 1,
  "mutationId": "3ec6b89e-0d03-47ef-b1a3-0797ef1d0e3f",
  "document": {
    "id": "project-example",
    "name": "정책 설문",
    "description": "",
    "survey": {"title": "", "description": "", "questions": []},
    "groups": [{"id": "group-example", "name": "기본 집단", "count": null, "filters": {}, "cohort": null}],
    "activeGroupId": "group-example",
    "model": null
  }
}
```

생성은 `expectedRevision: 0`, 수정은 마지막 응답의 `revision`을 사용한다. 응답은 `document` 필드들에 `revision/lastMutationId/updated`를 더한 형태다. `updated`는 서버의 UTC 시각이다.

- 매 저장마다 새 `mutationId`를 사용한다. 네트워크 오류로 재시도할 때는 **같은 요청 본문과 ID**를 재사용한다.
- 같은 요청이 마지막으로 반영되어 있으면 수정 번호를 올리지 않고 기존 결과를 반환한다. 같은 ID에 다른 본문이면 409다. 그 사이 다른 탭에서 저장했다면 덮어쓰지 않고 409로 멈춘다.
- 프로젝트 행을 잠근 트랜잭션 안에서 `expectedRevision`을 검사하고 집단 변경까지 커밋한다.
- 오류: `{error: {code, message, fields?}}`. 404 `PROJECT_NOT_FOUND`, 409 `REVISION_CONFLICT`/`MUTATION_REUSED`, 422 형식·참조 오류, 503 DB 연결 오류.
- 현재 목록 API는 설계 전체를 반환한다. 대규모 프로젝트/집단을 지원할 때 목록 요약·페이지네이션·개별 조회로 분리한다.

`StartRun` 요청 예:

```json
{"expectedRevision": 7, "requestId": "a-stable-unique-request-id", "groupId": "group-example", "failNext": false}
```

- 프론트는 미저장 설계를 먼저 저장한 뒤 승인된 `revision`으로 접수한다. 수정 충돌, 불완전한 설문, 10~500 범위 밖 인원, 구성 후 조건이 바뀐 집단은 실행할 수 없다.
- 응답 유실 시 동일 `requestId`와 본문으로 재요청하면 기존 실행을 반환한다. 다른 본문으로 같은 ID를 사용하거나, 같은 프로젝트에서 이미 대기·실행 중이면 409다.
- 상태: `queued → running → completed / partial_failed / failed`. 대기·실행 중 취소하면 `cancelled`가 된다. 재시도는 실패 작업만 `queued`로 바꾸며 이미 저장된 응답은 보존한다.
- `total`은 인원×문항 수, `succeeded`는 저장된 응답 수, `failed`는 실패 작업의 아직 생성하지 못한 응답 수다. 진행률은 `(succeeded + failed) / total`이다. 일부 실패도 모든 작업의 처리가 끝났으므로 100%가 될 수 있다.
- `failNext: true`는 한 페르소나가 첫 응답을 저장한 후 한 번 실패하도록 한다(단일 문항은 저장 전 실패). 실행 화면의 실패·재시도 시연 체크박스로 검증할 수 있다.

## 워커와 응답 계약

PostgreSQL 작업 테이블을 큐로 사용한다. `FOR UPDATE SKIP LOCKED`로 작업을 가져오고, 실행 행 → 작업 행 순서로 잠근다. 생성 중에는 DB 잠금을 유지하지 않는다. 임대 토큰·만료 시각을 매 저장마다 검사하므로 종료된 워커의 늦은 저장은 거부된다. 응답 저장과 다음 문항 위치 갱신은 한 트랜잭션이다. 임대 만료 작업은 재개하며 자동 인계가 3회 실패하면 수동 재시도할 수 있는 실패 상태로 남긴다.

한 페르소나의 문항은 순서대로 처리한다. 후속 질문은 부모 문항의 저장된 응답을 전달받는다. 시연 응답은 고정된 입력과 생성기 버전의 해시로 결정되며, 재시도해도 같은 답을 낸다. **GLM/Qwen/GPT 등 외부 모델을 호출하지 않으며 API 키도 사용하지 않는다.**

응답은 기존 결과 화면과 같은 `{personaId, questionId, answer, text, otherText}` 형식이다. 척도·선택형 `answer`는 **0부터 시작하는 인덱스**이고, 주관식은 `answer: null`과 문자열 `text`를 쓴다. 워커는 저장 전에 응답 ID·타입·범위를 검증한다. 기존 분포·집단 분석·페르소나 조회·CSV 함수를 그대로 재사용한다. 일부 실패·취소 결과는 유효 응답 수를 기준으로 분석하고 누락 안내를 표시한다.

## 프론트 동작

1. 최초 API 로딩이 끝날 때까지 편집 화면을 열지 않는다. 연결 실패와 없는 프로젝트를 구분한다.
2. 편집은 기존 Zustand 액션으로 즉시 반영한다. 500ms 입력 중단 후 프로젝트별로 순서대로 저장한다.
3. 저장 응답은 다음 저장의 수정 번호만 갱신하며, 입력 중인 최신 화면 내용을 덮어쓰지 않는다.
4. 미저장 초안과 진행 중 요청은 **사용자별·탭별 sessionStorage**에 보관해 같은 계정으로 새로고침 후 재전송한다. DB 저장 완료 전에 탭을 닫으면 경고한다. 탭을 닫아 임시 저장소가 사라지기 전에 저장 완료 또는 편집본 다운로드가 필요하다.
5. 네트워크 실패는 “저장 재시도”, 다른 탭과 충돌하면 “편집본 다운로드” 후 “서버 내용 불러오기”를 제공한다. 자동 병합·강제 덮어쓰기는 하지 않는다.
6. 기존 `personascope-proto-v4` 데이터는 자동 업로드하지 않고 목록에서 사본으로 가져올 수 있다. 예시 프로젝트 추가는 다른 프로젝트를 지우지 않는다.
7. 실행 상태는 2초마다 API에서 갱신한다. 브라우저는 응답을 생성하지 않는다. 결과는 조회할 때 DB에서 불러오며 새 탭이나 다른 브라우저에서도 같은 URL로 복원된다.

서버 없이 이전 프로토타입을 실행하려면 `npm run dev:demo`를 사용한다. 기본 `npm run dev`는 서버 저장 모드이며 연결 실패 시 로컬 시연으로 자동 전환하지 않는다.

## 검증

저장소 루트에서 `npm test -- --run`, `npm run build`.

백엔드 디렉터리에서:

```sh
PERSONA_TEST_DATABASE_URL=postgresql+psycopg://persona_lens@127.0.0.1:55432/persona_lens uv run pytest -q
```

실제 PostgreSQL을 사용한다. 각 테스트는 무작위 이름의 별도 스키마에 Alembic 마이그레이션을 적용하고 그 스키마만 정리한다. 테스트 DB 환경 변수가 없으면 DB 통합 테스트는 건너뛴다.

연결 테스트는 임의 포트의 로컬 모의 서버와 가짜 키만 사용한다. 공급자별 인증 헤더·페이지 처리, 키 암호화/비노출, 재로그인 복원, 개인/공용 접근 권한, DGX 허용 목록·리다이렉트 거부·직접 ID 등록, 비활성화·동시 수정, 선택 스냅샷과 시연 워커 유지까지 검사한다. 브라우저에서는 세 연결 등록/조회 → 모델 선택 → DB 저장 완료 → 새로고침으로 연결·모델 복원을 확인한다.

브라우저 확인: 새 프로젝트 → 7점 척도 문항 작성/복제 → 저장 완료 → 새로고침 → 제목·문항·척도 확인 → 대상집단 이름·빈 인원·필터·프로필 구성 → 저장 완료 → 새로고침 → 동일 집단 확인.

실행 확인: 200명×2문항 → 접수 직후 탭 닫기 → 새 탭에서 실행 기록 열기 → 400/400 완료 및 문항 분포 확인 → 초안·집단 수정 후 이전 결과 유지 확인. 실패 시연으로 부분 결과를 확인한 뒤 실패 작업만 재시도한다. 통합 테스트는 스냅샷 불변성, 동시 워커, 중복 접수·저장 방지, 취소, 체크포인트 복구, 실제 워커 프로세스 강제 종료·재시작을 포함한다.
