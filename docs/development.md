# 개발 문서

현재 기본 저장소는 PostgreSQL이다. 실행·API·저장 규약은 [백엔드 문서](../backend/README.md)를 참고한다. 아래 원본 비교 내용 중 브라우저 저장 형식 호환은 `npm run dev:demo` 모드와 기존 데이터 가져오기에 적용된다.

## 폴더 구조

```
legacy/                 원본 v4 프로토타입 (읽기 전용, 비교 기준)
backend/                FastAPI·SQLAlchemy·Alembic·PostgreSQL 통합 테스트
scripts/dev-db.sh        프로젝트 전용 로컬 PostgreSQL 시작·중지
docs/MIGRATION_NOTES.md 전환 진행 기록·원본과 다른 점·나중에 할 일
src/
├─ main.jsx, App.jsx    진입점, 레이아웃·라우트 구성
├─ data/                페르소나 스키마·지도 데이터(JSON)
├─ lib/                 화면과 무관한 순수 계산 로직(원본 core.js·csv.js·comparison.js)
├─ store/               Zustand 스토어(자동 저장, 실행 API·폴링, 로컬 시연 타이머)
├─ components/          레이아웃·공통 UI·조건 팝업·지도·차트
├─ pages/                화면(프로젝트 목록, 개요, 설문·대상 집단 설계, 시뮬레이션, 결과)
├─ utils/                포맷 함수
└─ styles/global.css    원본 스타일시트 그대로
tests/                   Vitest 테스트(원본과 결과 비교 포함)
```

## 원본과 달라진 점

기존 편집·분석 기능을 유지하며 서버 저장 상태, 오류 복구, 초기 로딩 화면을 추가했습니다.

- **Parquet 원본 집단.** 서버의 `PERSONA_PARQUET_PATH`로 설정한 파일을 DuckDB로 읽습니다. 필터 UI와 프로필 형식은 유지하고 정확한 인원 조회·실제 행 추출로 교체했습니다. 자동 저장은 불변 집단 ID를 참조하며 새로고침 시 DB의 프로필을 복원합니다. 상세 API·추출 규칙은 백엔드 문서에 있습니다.

- **계정과 모델 연결.** 로그인 후 프로젝트를 불러옵니다. 상단 모델 연결에서 OpenAI/Anthropic/DGX 연결을 등록하고 기존 설계 3단계에서 연결별 모델을 선택합니다. 공용 연결은 관리자만 관리하며 모델 선택은 `{connectionId, modelId}`로 저장합니다. UI 상태와 키를 설계 본문에 섞지 않습니다. 시뮬레이션은 시연 생성기를 유지합니다.
- **계정별 임시 저장.** 서버 모드의 미저장 초안·실행 접수 재시도와 로컬 시연 인터뷰는 사용자 ID별로 저장소 키를 분리합니다. 로그인 계정이 다른 탭에서 바뀌면 저장 요청을 차단하고 새로고침을 안내합니다. 이전 사용자 미구분 서버 outbox/cache는 자동 복원하지 않습니다.

- **URL 기반 라우팅.** React Router로 각 화면이 실제 경로를 가집니다. 프로젝트·설계·서버 실행 결과를 DB에서 불러온 뒤 경로를 복원합니다. 결과 화면의 선택 상태는 쿼리에 남습니다. 이전 로컬 시연 결과는 해당 브라우저에만 남습니다.
- **서버 실행.** 실행 전 저장을 완료하고 설문·대상집단 스냅샷을 확정합니다. 별도 Python 워커가 DB 큐에서 작업을 가져오며, 프론트는 상태를 조회합니다. 실패 작업만 재시도하고 부분 결과도 기존 분석 화면에서 볼 수 있습니다.
- **기존 데이터 호환.** `npm run dev:demo`는 기존 `localStorage` 키와 `{ projects: [...] }` 형식을 유지합니다. 서버 모드에서는 목록의 가져오기 버튼을 사용하며, 문항·집단 구조는 기존 화면과 같은 형식입니다.
- **"렌더링 중 보정" 로직의 위치.** 원본은 화면을 그릴 때마다 전역 변수를 유효한 값으로 직접 고쳤습니다(예: 보고 있던 문항이 사라지면 첫 문항으로). React 버전에서는 이런 보정을 상태에 저장하지 않고, 화면에 표시할 때만 계산해서 씁니다. 동작 결과는 같습니다.
- **한글 입력 관련 코드 제거.** 원본은 전체를 다시 그리면서 입력 중이던 칸의 포커스·커서를 수동으로 복원하는 코드가 있었습니다. React는 같은 입력칸을 다시 만들지 않으므로 이 코드는 옮기지 않았고, 조합 끊김 없이 그대로 동작합니다.

## 기준값 바꾸는 곳

표본 경고 인원, 비교 최소 인원, 차이 강조 기준(%p), 페르소나 생성 인원 범위 등은 모두 `src/lib/config.js` 한 곳에서만 정의합니다. 값을 바꾸면 전체 화면에 반영됩니다.

```js
export const CONFIG = {
  MIN_GROUP: 30,      // 이 인원 미만인 집단은 표본 경고
  MIN_CELL: 5,        // 비교 구간 최소 인원 (미만이면 흐리게 + 순위 제외)
  HIGHLIGHT_PP: 10,   // 차이 강조 기준 (%p)
  MIN_PERSONAS: 10,
  MAX_PERSONAS: 500,
}
```

## 테스트 구성

`npm test`(Vitest)가 돌리는 테스트입니다.

- `legacy-parity.test.js` — `rng`/`hash`/`weightedPicker`/`generate`/`buildCohort`/`createRun`과 집계 함수가 원본(`legacy/`)과 같은 결과를 내는지 비교
- `csv-export-parity.test.js` — CSV 출력(wide/long/codebook)이 원본과 바이트 단위로 같은지 비교
- `store.test.js` — `useProjectStore`의 저장/복원, 예시 데이터 생성, 실행 시작·완료·실패 동작
- `simulationJob.test.js` — 시뮬레이션 타이머 동작
- `ux-flow.test.js` — 설문·대상 집단 상태 흐름 계산
- `result-url-state.test.js` — 결과 탐색 상태의 URL 복원
- `format.test.js` — 조사(`josa`) 등 포맷 함수
- `project-sync.test.js` — 자동 저장 순서, 응답 유실 재시도, 미저장 초안 복구, 수정 충돌
- `server-runs.test.js` — 저장 후 실행, 중복 접수·응답 유실, 지연된 폴링 응답, 부분 결과 상태
- `connections.test.js`, `server-store.test.js` — 연결 상태, 모델 선택 복원, 키 제외, 계정별 초안 분리
- `backend/tests/` — 실제 PostgreSQL 마이그레이션·왕복 저장·동시 쓰기·스냅샷 불변성·작업 재시도·워커 프로세스 중단 복구

## 원본(legacy/) 실행 방법

`legacy/index.html`을 브라우저로 직접 열면 됩니다(서버 불필요). `localStorage` 키(`personascope-proto-v4`)가 React 버전과 같아서 서로의 저장 데이터를 그대로 불러올 수 있습니다.
