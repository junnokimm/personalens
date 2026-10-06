# PersonaScope — React 전환 작업 규칙

합성 페르소나로 설문을 시뮬레이션하는 연구용 프로토타입이다. 1차 사용자는 정책·여론 연구자다.
지금 하는 일은 `legacy/`의 바닐라 JS 프로토타입(v4, 2026-10-06)을 React로 **그대로** 옮기는 것이다.

## 목표와 범위

- 기능, 화면 구성, 문구, CSS 클래스, aria 속성을 원본과 똑같이 유지한다.
- 디자인 개선, 기능 추가, 문구 수정, 원본 버그 수정은 하지 않는다. 발견하면 `docs/MIGRATION_NOTES.md`의 "나중에 할 일"에 적기만 한다.
  - 예외: 원본이 의존하던 전역 변수가 사라져 생기는 오류처럼, 전환 때문에 생긴 문제는 고친다.
- `legacy/`는 비교 기준이다. 읽기만 하고 수정하지 않는다.
- 기능 설명과 확정 결정은 `legacy/REVISION_NOTES.md`에 있다. 동작이 애매하면 이 문서와 원본 코드를 근거로 판단하고, 그래도 애매하면 묻는다.

## 기술 스택 (확정)

- React(최신 안정 버전) + Vite, JavaScript(JSX). TypeScript 전환은 이번 범위가 아니다.
- 라우팅: React Router
- 상태: Zustand + `immer` 미들웨어 + `persist` 미들웨어
- 테스트: Vitest
- 이 밖의 라이브러리(UI 키트, 차트, CSS-in-JS 등)는 추가하지 않는다. 꼭 필요하면 먼저 묻는다.

## 명령어

```
npm run dev     # 개발 서버
npm run build   # 빌드 (단계마다 통과해야 함)
npm test        # Vitest (단계마다 통과해야 함)
```

원본을 브라우저로 볼 때는 `legacy/index.html`을 그대로 연다. 서버가 필요 없다.

## 폴더 구조

```
legacy/                        # 원본 v4 (수정 금지)
docs/MIGRATION_NOTES.md        # 진행 상황, 원본과 다른 점, 나중에 할 일
scripts/convert-legacy-data.mjs
tests/                         # legacy-parity.test.js 등
src/
├─ main.jsx
├─ App.jsx                     # 레이아웃 + 라우트 + 시뮬레이션 타이머 마운트
├─ data/                       # personaSchema.json, koreaMap.json
├─ lib/                        # 화면과 무관한 순수 로직 (원본 core.js·csv.js·comparison.js 계산부)
│  ├─ config.js  random.js  schema.js  survey.js  cohort.js
│  ├─ simulation.js  analysis.js  comparison.js  csv.js  sample.js
├─ store/
│  ├─ useProjectStore.js       # 저장되는 데이터 (persist)
│  ├─ useUiStore.js            # 저장되지 않는 화면 상태
│  └─ useSimulationJob.js      # 진행률 타이머
├─ components/
│  ├─ layout/    # Sidebar, NavStatus, Topbar
│  ├─ common/    # Modal, ConfirmModal, Toast, Banner, PageHead, StatusTag
│  ├─ filters/   # FilterModal, FilterChips, Big5Range, RegionPicker (원본 conditions.js)
│  ├─ map/       # KoreaMap (지역 지도 보기 NEW-01)
│  └─ charts/    # PairBars, DistributionBar 등
├─ pages/
│  ├─ ProjectsPage.jsx
│  ├─ overview/  # SummaryPage, RunsPage
│  ├─ design/    # SurveyPage, QuestionBlock, TargetPage, GroupPreview
│  ├─ SimulationPage.jsx
│  └─ results/   # ResultsPage, OverallView, SegmentView, ResponseComparison,
│                #  PersonasView, DetailView, ChatView, ExportView
├─ utils/format.js             # stamp, pct
└─ styles/global.css           # 원본 style.css 그대로
```

## 원본 → 새 위치

| 원본 | 새 위치 | 메모 |
| --- | --- | --- |
| `persona-schema.js` (374KB) | `src/data/personaSchema.json` | `const PERSONA_SCHEMA=` 앞부분만 떼고 JSON으로. 스크립트로 변환하고 손으로 고치지 않는다. |
| `korea-map.js` | `src/data/koreaMap.json` | 같은 방식 |
| `core.js` | `src/lib/*` | `root.PS` 대신 named export. 함수 본문은 바꾸지 않는다. |
| `csv.js` | `src/lib/csv.js` | `PSCSV` 전역 제거 |
| `comparison.js` | 계산은 `lib/comparison.js`, 화면은 `pages/results/ResponseComparison.jsx` | 전역 `CMP` → 화면 상태 |
| `conditions.js` | `components/filters/` | 전역 `FM` → `FilterModal` 내부 state. 대상 집단과 페르소나 필터 두 곳에서 재사용 |
| `app.js` | `pages/`, `components/`, `store/` | |
| `style.css` | `src/styles/global.css` | 클래스명 그대로. CSS Modules로 바꾸지 않는다. |
| `index.html` | `index.html` | Google Fonts(Noto Sans KR) 링크와 `lang="ko"` 유지 |

## 상태를 어디에 둘지

원본은 `app.js` 맨 위 전역 변수에 상태를 몰아 두었다. 아래처럼 나눈다.

| 원본 변수 | 새 위치 |
| --- | --- |
| `data` | `useProjectStore` (persist) |
| `page`, `projectId`, `runId`, `view` | URL (아래 라우트 표) |
| `qid`, `drill`, `segKey`, `segMode`, `pf`, `pSearch`, `pSort`, `pChatted`, `pPage`, `personaId`, `chatQid`, `respCol`, `distKey`, `CMP` | `useUiStore`의 결과 화면 상태. 원본 `openRun()`이 초기화하는 항목은 실행이 바뀔 때 똑같이 초기화한다. |
| `openQs`, `lastDeleted` | `useUiStore` (삭제 취소 토스트가 화면 이동 뒤에도 동작해야 함) |
| `job`, `failNext` | `useSimulationJob` / `useUiStore` |
| `CONFIRM`, 토스트 | `useUiStore` + `ConfirmModal`, `Toast` |

## 라우트

| 경로 | 원본 `page` |
| --- | --- |
| `/` | `projects` |
| `/p/:projectId` | `summary` |
| `/p/:projectId/runs` | `runs` |
| `/p/:projectId/results/:runId?` + `?view=overall\|segment\|personas\|detail\|chat\|export` | `results` |
| `/p/:projectId/design/survey` | `survey` |
| `/p/:projectId/design/target` | `target` |
| `/p/:projectId/simulation` | `simulation` |

- 없는 프로젝트·실행 ID로 들어오면 원본 `go()`처럼 프로젝트 목록이나 결과 빈 화면으로 보낸다.
- 상단 바 문구는 원본 `pageTitle()`을 그대로 쓴다(`프로젝트명 / 개요 · 결과`).
- 원본에 없던 기능이지만 URL 덕분에 뒤로 가기가 동작한다. 이것은 의도한 변화다.

## 반드시 지킬 것

1. **저장 데이터 호환.** localStorage 키 `personascope-proto-v4`와 `{ projects: [...] }` 구조를 바꾸지 않는다. persist는 원본과 같은 형태로 저장하도록 `partialize`/`storage`를 맞춘다(persist가 덧씌우는 `{ state, version }` 래퍼 때문에 원본 저장 데이터가 안 열리면 안 된다). 원본 `load()`의 처리도 옮긴다: 데이터가 없으면 예시 프로젝트 생성, `running`이던 실행은 `failed` + "페이지를 새로 열어 실행이 멈췄습니다."
2. **계산 결과 동일.** 같은 입력이면 원본과 같은 결과가 나와야 한다. `rng`, `hash`, `weightedPicker`, `generate`, `buildCohort`, `createRun`에서 난수를 꺼내는 순서와 루프 순서를 바꾸지 않는다. 순서가 하나만 바뀌어도 모든 응답이 달라진다. `tests/legacy-parity.test.js`가 이것을 검사한다.
3. **변경 함수는 스토어 액션 안에서만.** `buildCohort`, `lockVersion` 등은 인자를 직접 수정한다. 이런 함수는 immer draft를 넘겨 스토어 액션 안에서 호출하고, 컴포넌트에서 스토어 객체를 직접 수정하지 않는다. 액션 이름은 원본 함수 이름을 따른다(`editQ`, `addOpt`, `moveQ`, `deleteQ`, `undoDelete`, `restoreVersion`, `startRun`, `retryRun` 등).
4. **`touch()` 의미 유지.** 원본은 프로젝트를 수정할 때마다 `updated` 시각을 갱신하고 저장한다. 같은 액션에서 같이 처리한다.
5. **시뮬레이션은 화면을 옮겨도 계속 진행한다(N-04).** 타이머는 `App`에서 한 번만 마운트한다. 450ms마다 10%씩 올리고, 실패 시연(`failNext` → `failAt` 60%), 완료·실패 토스트와 그 안의 버튼("결과 보기", "실행 기록 보기")을 원본과 같게 한다. 진행 중 실행이 있으면 새 실행을 막는다.
6. **문자열 HTML 금지.** `innerHTML`, `esc()`, `dangerouslySetInnerHTML`을 쓰지 않는다. 지도 경로는 JSX `<path d={...}>`로 그린다. 인라인 `onclick="..."` 문자열과 토스트의 동작 문자열은 함수·콜백으로 바꾼다.
7. **한글 입력이 끊기면 안 된다.** 원본은 한글 조합이 깨지는 문제를 고친 이력이 있다(REVISION_NOTES "한글 입력 수정"). 입력칸의 `key`를 안정적으로 유지해 입력 중 다시 마운트되지 않게 하고, 설문 문구·선택지·척도 이름·페르소나 검색·조건 팝업 검색에서 한글을 직접 쳐 보고 확인한다. 원본 `render()`의 포커스·커서 복원 코드는 옮기지 않는다(React에서는 필요 없어야 정상이다).
8. **Big5 슬라이더**는 끄는 동안 숫자와 인원만 갱신하고, 놓을 때 확정한다(원본과 같음).
9. **모바일(폭 760px 이하)**에서는 사이드바가 가로 한 줄 메뉴가 되고, 현재 메뉴가 화면 안으로 스크롤된다. 이 동작을 유지한다.
10. **기준값은 `lib/config.js` 한 곳**(`MIN_GROUP`, `MIN_CELL`, `HIGHLIGHT_PP`, `MIN_PERSONAS`, `MAX_PERSONAS`)에서만 정의한다.
11. **인터뷰는 템플릿 답변**이다. AI API를 연결하지 않는다.
12. **CSV 내보내기**는 Blob 다운로드, 파일명 `PersonaScope_실행{번호}_{형식}.csv`, 후속 질문 열 이름(`q1_1`)을 원본과 같게 한다.

## 작업 방식

- `PROMPTS.md`의 단계 단위로 진행한다. 한 단계 안에서는 시작 전에 할 일을 짧게 보고하고 진행한다.
- 모든 작업은 `feat/react-migration` 브랜치에서 한다. main에는 커밋하거나 push하지 않는다. 작업 전에 `git branch --show-current`로 확인한다.
- 단계가 끝날 때마다 `npm run build`와 `npm test`를 통과시킨 뒤 아래 "커밋 메시지 (고정)" 표대로 커밋하고 `git push`한다.
- force push(`--force`), `git reset --hard`, 브랜치 삭제는 하지 않는다. 필요하면 먼저 묻는다.
- 단계가 끝나면 `docs/MIGRATION_NOTES.md`의 "진행 상황"을 갱신한다. 원본과 일부러 다르게 만든 점과 그 이유도 여기에 적는다.
- 큰 파일(`personaSchema.json`, `legacy/persona-schema.js`)은 통째로 읽지 않는다. 구조가 필요하면 `jq`나 짧은 스크립트로 필요한 부분만 본다.
- 컴포넌트가 300줄을 넘으면 나눈다.

## 커밋 메시지 (고정)

커밋 제목은 아래 표의 문구를 **한 글자도 바꾸지 않고 그대로** 쓴다. 새로 짓거나 줄이거나 `[단계 N]` 같은 머리말을 붙이지 않는다.
한 단계에 커밋이 여러 개면 표의 순서대로 나눠 커밋하고, 각 커밋에는 "담을 내용"에 해당하는 파일만 넣는다.
본문 마지막 줄에는 `Refs: 단계 N`을 넣는다. 커밋 전에 `git log -1 --format=%s`로 제목이 표와 같은지 확인한다.

```
git commit -m "<표의 제목>" -m "Refs: 단계 N"
```

| 단계 | 커밋 제목 (그대로) | 담을 내용 |
| --- | --- | --- |
| 0 | `chore: 저장소 초기 설정 및 원본 프로토타입 v4 추가` | `.gitignore`, `README.md`, `legacy/`, `CLAUDE.md` (사람이 커밋) |
| 1 | `docs(migration): React 전환 계획 작성` | `docs/MIGRATION_NOTES.md` (계획 절) |
| 2 | `build: Vite + React 프로젝트 설정` | `package.json`, lock 파일, `vite.config.js`, `index.html`, `src/main.jsx`, `src/App.jsx`, `.gitignore` 변경 |
| 2 | `chore(data): 페르소나 스키마와 지도 데이터를 JSON으로 변환` | `scripts/convert-legacy-data.mjs`, `src/data/` |
| 2 | `chore: 원본 스타일시트 이전` | `src/styles/global.css`와 그 import, MIGRATION_NOTES 갱신 |
| 3 | `refactor(lib): core.js를 기능별 모듈로 분리` | `src/lib/` |
| 3 | `test(lib): 원본 대비 회귀 테스트 추가` | `tests/`, Vitest 설정, MIGRATION_NOTES 갱신 |
| 4 | `feat(store): 프로젝트·화면 상태 스토어 추가` | `useProjectStore`, `useUiStore`와 그 테스트 |
| 4 | `feat(simulation): 실행 진행률 타이머 훅 추가` | `useSimulationJob`과 그 테스트, MIGRATION_NOTES 갱신 |
| 5 | `feat(layout): 사이드바와 상단 바 구현` | `components/layout/`, `components/common/`, 라우트 구성 |
| 5 | `feat(overview): 프로젝트 목록·요약·실행 기록 화면 구현` | `pages/ProjectsPage.jsx`, `pages/overview/`, MIGRATION_NOTES 갱신 |
| 6 | `feat(survey): 설문 편집 화면 구현` | `pages/design/SurveyPage.jsx`, `QuestionBlock.jsx`, 관련 액션 |
| 6 | `fix(survey): 한글 입력 중 입력칸이 다시 마운트되는 문제 수정` | 한글 입력 문제를 실제로 고친 경우에만. 고칠 게 없으면 이 커밋은 만들지 않는다. MIGRATION_NOTES 갱신은 이 단계의 마지막 커밋에 |
| 7 | `feat(filters): 조건 선택 팝업 구현` | `components/filters/` |
| 7 | `feat(target): 대상 집단 화면 구현` | `pages/design/TargetPage.jsx`, `GroupPreview.jsx`, 미리보기용 `components/map/` |
| 7 | `feat(simulation): 실행 화면 구현` | `pages/SimulationPage.jsx`, MIGRATION_NOTES 갱신 |
| 8 | `feat(results): 전체 결과와 집단 분석 구현` | `pages/results/`의 ResultsPage, OverallView, SegmentView, ResponseComparison |
| 8 | `feat(map): 지역 지도 보기 구현` | 집단 분석 지도 보기, `components/map/` 확장, MIGRATION_NOTES 갱신 |
| 9 | `feat(personas): 페르소나 목록·상세·인터뷰 구현` | PersonasView, DetailView, ChatView |
| 9 | `feat(export): CSV 내보내기 구현` | ExportView, 다운로드, MIGRATION_NOTES 갱신 |
| 10 | `refactor: 사용하지 않는 코드 정리` | 정리, 300줄 넘는 컴포넌트 분리 |
| 10 | `docs: README 작성` | `README.md`, MIGRATION_NOTES 최종 갱신 |

표에 없는 커밋이 꼭 필요하면(앞 단계의 실수를 고치는 경우 등) 만들기 전에 먼저 묻는다. 허락받으면 Conventional Commits 형식(`fix(<scope>): <설명>`, 설명은 한국어, 마침표 없음)으로 쓴다.

## 표기

- 화면 문구, 주석, 문서는 한국어. 코드 식별자는 영어.
- 원본 화면의 용어("실행", "대상 집단", "후속 질문", "표본 경고" 등)를 그대로 쓴다. 영어 라벨(Run, Survey 등)을 새로 만들지 않는다.

## 완료 기준

- `tests/legacy-parity.test.js` 통과
- 개발 서버에서 콘솔 오류 없음
- `PROMPTS.md` 마지막의 원본 비교 체크리스트 전부 통과
- 원본에서 저장한 localStorage 데이터가 새 버전에서 그대로 열림
