# PersonaScope React 전환 — 마이그레이션 노트

## 진행 상황

- 2026-10-06: 코드 작업 시작 전. `legacy/` 전체(`index.html`, `core.js`, `csv.js`, `comparison.js`, `conditions.js`, `app.js`, `REVISION_NOTES.md`)와 `persona-schema.js`/`korea-map.js` 구조를 읽고 계획을 세움. 아래 "계획" 절 참고.
- 2026-10-06 [단계 2]: Vite + React(JS) 프로젝트 뼈대를 만들고 `react-router-dom`, `zustand`, `immer`, `vitest`를 설치함. `npm run dev`/`npm run build` 모두 통과 확인(빌드 결과물에 `legacy/` 내용 없음 — React 내부의 `react.legacy_hidden` 심볼과는 무관).
  - `scripts/convert-legacy-data.mjs`로 `legacy/persona-schema.js` → `src/data/personaSchema.json`, `legacy/korea-map.js` → `src/data/koreaMap.json` 변환. 스크립트가 원본 JS를 실제로 실행해 얻은 객체와 변환된 JSON을 `assert.deepStrictEqual`로 비교해 통과 확인(수작업 수정 없음).
  - `legacy/style.css`를 `src/styles/global.css`로 그대로 복사(diff 없음 확인)하고 `main.jsx`에서 불러옴.
  - `index.html`에 원본의 `lang="ko"`, viewport, title, Google Fonts(Noto Sans KR) 링크를 옮김. 원본과 다른 점: `<link rel="stylesheet" href="style.css">` 대신 CSS를 `main.jsx`에서 import(Vite 관례, 기능상 차이 없음).
  - `App.jsx`는 이번 단계에서 "PersonaScope" 글자만 표시하는 자리표시자. 실제 레이아웃·라우팅은 다음 단계에서 작업.
  - `.gitignore`에 Vite 템플릿의 `dist-ssr/`, `*.local`, 로그/에디터 관련 줄을 기존 줄은 그대로 두고 추가. `README.md`는 scaffold 템플릿 설명(Oxlint, React Compiler 등 미사용 내용)이라 합칠 내용이 없어 그대로 둠.
  - `package.json`의 `name`은 `personascope`로 지정. Oxlint 등 scaffold가 기본으로 넣는 린트 도구는 요청받지 않아 설치하지 않음.
- 2026-10-07 [단계 3]: `core.js`·`csv.js`·`comparison.js`의 계산부를 `src/lib/`로 나눠 옮김(`config.js`, `random.js`, `schema.js`, `survey.js`, `cohort.js`, `simulation.js`, `analysis.js`, `comparison.js`, `csv.js`, `sample.js`). `comparison.js`는 `compareRows`/`topAttributes`/`gapText`만 옮기고, HTML을 만드는 `gapBadge`/`pairBars`/`responseComparison`은 화면 작업 단계로 남겨 둠.
  - `root.PS`/`root.PSCSV`/전역 `PERSONA_SCHEMA` 대신 모듈별 named export를 쓰고, 함수 본문·난수를 꺼내는 순서·루프 순서는 그대로 둠. `core.js`의 `SCHEMA()` 헬퍼(전역 `PERSONA_SCHEMA` 또는 `root.PERSONA_SCHEMA` 참조)는 `src/data/personaSchema.json` import로 교체했지만, 나머지 함수 본문에서는 그대로 `SCHEMA()`로 호출하도록 `schema.js`·`cohort.js`에 동일한 지역 헬퍼를 둠(전역이 없어져 생긴 문제를 고친 것 — 전환 규칙 2번 예외).
  - `tests/legacy-parity.test.js`를 추가함. `node:vm`으로 `legacy/persona-schema.js`→`core.js`→`csv.js`→`comparison.js`를 순서대로 `runInContext`해서 원본 `PS`/`PSCSV`/`compareRows` 등을 그대로 얻고, 프로젝트·문항·집단 ID를 고정 문자열로 만든 fixture 3종((a) 후속 질문 포함 sample 구성, (b) 지역·연령·Big5 조건이 걸린 집단, (c) 주관식+'기타' 선택지가 있는 설문)으로 `buildCohort`/`createRun`/`distribution`/`responseStats`/`breakdown`/`filterPeople`/`estimateCount`/`compareRows`/`topAttributes`/`validateSurvey`/`lockVersion`/`exportCsv`(wide·long·codebook) 결과를 원본과 비교함. `uid()`가 쓰는 `Date.now()`/`Math.random()` 때문에 `cohort.created`·`run.id`·`run.created`만 고정값으로 덮어쓰고 비교함. 모두 통과(`npm test` 28개).

## 계획

### 1. "원본 → 새 위치" 표와 폴더 구조가 실제 코드와 맞는지

전반적으로 표와 폴더 구조는 실제 코드와 잘 맞는다. 확인된 사항과 표에서 빠진 부분은 다음과 같다.

**표대로 맞는 것**

- `persona-schema.js` → `src/data/personaSchema.json`: `const PERSONA_SCHEMA=` 뒤가 그대로 `{source, total, columns, country, fields, unavailable, regionDistricts}` 객체라 스크립트로 바로 JSON 변환 가능.
- `korea-map.js` → `src/data/koreaMap.json`: `{w, h, regions: {지역명: {d, c}}}` 구조. 지역명이 `경상남도` 등 **정식 이름**으로 되어 있어, `core.js`의 `regionName()`(짧은 이름 → 정식 이름 변환)과 맞춰 쓰면 된다.
- `comparison.js`는 계산부(`compareRows`, `topAttributes`, `gapText`)와 화면부(`gapBadge`, `pairBars`, `responseComparison`, 전역 `CMP`)가 한 파일에 섞여 있지만 분리 기준이 명확하다. 계산부 → `lib/comparison.js`, 화면부 → `ResponseComparison.jsx` + `CMP` → `useUiStore`.
- `conditions.js`의 `filterChips()`는 조건 팝업 전용이 아니라 `app.js`의 요약·대상 집단·시뮬레이션·페르소나 목록 화면에서도 재사용된다. 폴더 구조에 `FilterChips`가 `components/filters/`에 이미 있어 이 재사용이 반영돼 있다.
- `PairBars`/`DistributionBar`(차트)도 선택지 비교, 전체 결과 응답 분포, 집단 나누기 차트, 대상 집단 분포 미리보기 등 여러 화면에서 같은 막대 패턴이 반복돼 재사용할 근거가 있다.
- `korea-map.js` 기반 지도는 집단 나누기(`mapView`, 전체 기능)와 대상 집단 미리보기(`miniMap`, 축소판) 두 곳에서 쓰인다. `components/map/KoreaMap.jsx` 하나를 모드(`full`/`mini`) prop으로 구분해 재사용하면 된다.

**표에서 빠졌거나 애매한 부분 — 제안**

| 빠진 것 | 원본 위치 | 제안 |
| --- | --- | --- |
| `clone`, `uid`, `rng`, `hash`, `weightedPicker` | `core.js` 맨 위 | `rng`/`hash`/`weightedPicker` → `lib/random.js`. `clone`/`uid`는 난수와 무관한 범용 헬퍼라 `lib/schema.js`에 같이 둔다(새 파일을 만들지 않기 위함). |
| `saveOk` (저장 성공/실패 표시) | `app.js` 전역 변수, `save()`가 갱신 | 상태 표(`CLAUDE.md`)에 없음. `useUiStore`에 추가해야 함. persist의 커스텀 `storage.setItem`이 예외를 잡으면 이 값을 갱신하도록 연결. |
| `mapColor` (지도 색 기준: 차이/비율) | `app.js` 전역 변수 | 상태 표에 없음. `segKey`/`segMode`와 같은 그룹(결과 화면 상태)이라 `useUiStore`에 추가하고, `openRun()`이 초기화하는 항목에 포함시켜야 함. |
| `MAPROWS` (지도 툴팁용 조회 테이블) | `app.js` 전역 변수 | 상태가 아니라 `rows`에서 바로 계산되는 파생값. 저장할 필요 없이 `KoreaMap` 컴포넌트 안에서 `useMemo`로 계산. |
| `index.html`의 `#project-context`/`#nav`/`#crumb`/`#save-state`/`#overlay`/`#toast` | `index.html` + `app.js render()` | 표에 명시는 없지만 폴더 구조(`layout/`, `common/`)로 보면 이미 답이 정해져 있음: 새 `index.html`은 폰트 링크·`global.css`·`<div id="root">`만 남기고, 나머지는 `Sidebar`/`Topbar`/`Modal`/`Toast` 컴포넌트로 옮긴다. 확인 질문 불필요, 작업 시 그대로 진행. |

### 2. `app.js` 함수를 화면·컴포넌트별로 묶은 목록

**공통 유틸 (화면 무관, React에서는 대부분 불필요하거나 `utils/format.js`로)**
`$`, `esc`(rule 6으로 제거), `stamp`, `pct`, `STORE`

**데이터/스토어 접근자**
`load`, `save`, `touch`, `P`, `R`, `G`

**공통 UI 컴포넌트 (`components/common/`)**
`toast` → Toast, `closeModal`/`#overlay` → Modal, `confirmModal` → ConfirmModal, `head` → PageHead, `banner` → Banner, `statusTag` → StatusTag

**레이아웃 (`components/layout/`)**
`go`, `openProject`, `section`, `render`(React에서는 불필요), `pageTitle` → Topbar, `navStatus` → NavStatus, `navHtml` → Sidebar

**`pages/ProjectsPage.jsx`**
`projects`, `newProject`, `resetDemo`

**`pages/overview/SummaryPage.jsx`**
`runRow`(RunsPage와 공유), `summary`

**`pages/overview/RunsPage.jsx`**
`runs`

**`pages/design/SurveyPage.jsx` + `QuestionBlock`**
`surveyPage`, `qBlock` → QuestionBlock, `SQ`, `markDraft`, `softSurvey`, `editS`, `editQ`, `changeType`, `editOpt`, `addOpt`, `delOpt`, `toggleQ`, `focusQ`, `addQ`, `addFollow`, `moveQ`, `deleteQ`, `undoDelete`, `restoreVersion`

**`pages/design/TargetPage.jsx` + `GroupPreview`**
`targetPage`, `renderSide`(React 불필요), `groupPreview` → GroupPreview, `openTargetFilter`, `removeTargetFilter`, `build`, `addGroup`, `dupGroup`, `delGroup`

**`pages/SimulationPage.jsx`**
`sameAsRun`, `simulation`, `confirmRun`, `startRun`, `tick`(→ `useSimulationJob`), `refreshProgress`(React 불필요), `retryRun`

**결과 화면 틀 (`pages/results/ResultsPage.jsx`)**
`openResults`, `openRun`, `openChat`, `Q`, `results`

**`pages/results/OverallView.jsx` (+ `ResponseComparison`)**
`questionTabs`, `pickQ`, `questionHead`, `shade`, `overallView`
`comparison.js`의 `responseComparison`, `gapBadge`, `pairBars` → `ResponseComparison.jsx`

**`pages/results/SegmentView.jsx` (+ `components/map/KoreaMap.jsx`)**
`trail`, `startSegment`, `drillFilters`, `segmentView`, `segGap`, `mapClass`, `mapView` → KoreaMap(full), `miniMap` → KoreaMap(mini, GroupPreview에서도 사용), `mapTip`, `mapHi`, `narrow`, `toPersonas`

**`pages/results/PersonasView.jsx`**
`chatsOf`, `personaList`, `personaResults`, `refreshPersonas`(React 불필요), `personasView`, `openPersonaFilter`, `removePf`, `openPersona`

**`pages/results/DetailView.jsx`**
`person`, `peopleTrail`(ChatView와 공유), `big5Bars`, `profileHtml`, `responseItems`(ChatView와 공유), `detailView`

**`pages/results/ChatView.jsx`**
`suggestions`, `chatView`, `ask`

**`pages/results/ExportView.jsx`**
`exportView`, `downloadCsv`

**조건 팝업 (`components/filters/FilterModal.jsx` 등, `conditions.js` 전체)**
`fmFields`, `fmField`, `fmOptions`, `valueText`, `fieldLabel`, `filterChips` → FilterChips(공유), `openFilterModal`, `fmSnapshot`, `fmUndo`, `renderFM`(React 불필요), `fmListHtml`, `fmEditorHtml`, `fmBig5Html` → Big5Range, `fmRegionHtml` → RegionPicker, `fmRefreshOpts`(React 불필요), `fmCountHtml`, `fmSet`, `fmToggle`, `fmSelectShown`, `fmRemove`, `fmKeywords`, `fmBig5`, `fmBig5Soft`, `fmRegion`, `fmApply`

**부트스트랩**
`Escape` 키 리스너 → Modal 공통 처리, `load(); save(); render();` → `main.jsx`/스토어 초기화

### 3. 스토어 액션 목록 (`data`를 수정하는 함수, 원본 이름 유지)

**프로젝트**
- `newProject` — `app.js`에는 모달을 여는 함수 이름만 있고, 실제 `data.projects` 변경은 이름 없는 `onOk` 콜백 안에 있음. 액션 이름은 `newProject`로 제안(원본에 더 가까운 이름이 없음).
- `resetDemo`
- `touch` — 거의 모든 액션 끝에서 같이 호출(규칙 4)

**설문**
- `editS`, `editQ`, `changeType`, `editOpt`, `addOpt`, `delOpt`, `addQ`, `addFollow`, `moveQ`, `deleteQ`, `undoDelete`, `restoreVersion`
- `lockVersion` — `core.js` 함수. 독립 액션으로 노출되진 않고 `startRun` 안에서 호출됨.

**대상 집단**
- `addGroup`, `dupGroup`, `delGroup`
- `buildCohort` — `app.js`의 `build()`가 호출하는 `core.js` 함수 이름. 규칙 3 예시에 명시돼 있으므로 액션 이름은 `build`가 아니라 `buildCohort`로 맞춘다.
- 다음 셀은 `app.js`에 이름 없는 인라인 대입이라 액션 이름 제안이 필요함: `G().filters = f`(대상 조건 적용, `openTargetFilter`의 `onApply`) → **제안: `applyTargetFilter`**, `delete G().filters[key]` → 이미 이름 있음 **`removeTargetFilter`**, `G().name = ...` → **제안: `renameGroup`**, `G().count = ...` → **제안: `setGroupCount`**, `P().activeGroupId = ...`(대상 집단·시뮬레이션 두 곳에서 공용) → **제안: `selectGroup`**

**시뮬레이션**
- `startRun`, `retryRun`
- `tick` — 진행률 타이머 콜백. 사용자 액션은 아니지만 `data`(실행 상태)를 바꾸므로 `useSimulationJob`에서 같은 이름으로 유지할 것을 제안.

**인터뷰**
- `ask`

### 4. 전환 시 위험한 부분 상위 5개

1. **계산 결과 동일성 (`rng`/`hash` 호출 순서)** — `buildCohort`는 `SCHEMA().fields`를 순서대로 돌며 `pickers` 객체를 만들고, `Object.keys(pickers)` 순서대로 값을 뽑는다. `createRun`/`generate`도 `survey.questions`(=`ordered()` 결과) 순서, `DRIVERS` 배열 순서, `hash(q.id+k+...)` 조합 순서에 그대로 의존한다. JSON 변환 스크립트가 `fields` 배열 순서를 바꾸거나(예: 키 정렬), immer draft에서 객체를 스프레드로 재구성하면서 키 순서가 바뀌면 같은 입력에도 다른 응답이 나온다. **대응:** 변환 스크립트는 원본 배열 순서를 그대로 보존하고 정렬하지 않는다. `tests/legacy-parity.test.js`로 원본 고정 입력에 대한 응답 해시를 비교해 순서 보존을 검증한다.
2. **"렌더링 중 상태를 스스로 보정"하는 패턴** — 원본은 화면을 그릴 때마다 전역 변수를 조건에 맞게 직접 고쳐서 항상 유효한 기본값을 유지한다: `responseComparison()`의 `CMP.key !== key`면 `CMP` 재설정, `segmentView()`의 `avail.includes(segKey)`가 아니면 `segKey` 보정 + `segMode==='map'`인데 `segKey!=='region'`이면 `segMode` 보정, `personaList()`의 `respCol` 유효성 보정, `groupPreview()`의 `distKey` 보정. React로 그대로 옮기면(`useEffect`로 "key가 바뀌면 스토어 리셋") 리렌더가 리렌더를 유발해 깜빡임이나 무한 루프가 생기기 쉽다. **대응:** 이런 "항상 유효한 기본값"은 스토어에 그대로 저장하지 말고, 화면에서 `useMemo`로 "유효하지 않으면 기본값 사용"을 계산해서 쓰고, 사용자가 실제로 바꿀 때만 스토어에 쓴다.
3. **조건 팝업(`FilterModal`) 상태 복잡도** — `fmSnapshot`/`fmUndo`(최근 30개 되돌리기 히스토리), Big5 슬라이더(`oninput`으로는 숫자만 갱신, `onchange`에서 확정), 지역 체크박스의 부모·자식 동기화(`fmRegion`), 값 검색 중 입력칸을 다시 그리지 않는 처리(`fmRefreshOpts`)가 한 모듈 안에 촘촘히 얽혀 있고, 대상 집단(`target`)과 페르소나 필터(`persona`) 두 모드가 옵션 목록 소스(`PS.field` vs `PS.breakdown`/응답)까지 다르게 분기한다. 두 모드를 한 컴포넌트로 합치면서 사소한 분기 하나만 놓쳐도 한쪽 모드에서만 동작이 어긋나기 쉽다. 같은 영역에서 한글 입력(조건 항목 검색·값 검색)이 조합 깨짐 문제의 재발 지점이기도 하다(규칙 7). **대응:** target/persona 분기를 데이터 소스 하나로 추상화(`fmOptions`처럼)하고, 두 모드로 직접 수동 테스트(조건 적용·되돌리기·Big5·지역·한글 검색)한다.
4. **`localStorage` 저장 포맷 호환** — Zustand `persist`는 기본적으로 `{state, version}` 래퍼를 씌운다. 원본 키 `personascope-proto-v4`는 `{projects:[...]}`를 그대로 담고 있어야 하므로 커스텀 `storage`가 필요하고, 그 커스텀 `storage.getItem`이 원본 `load()`의 마이그레이션(`running` 실행 → `failed` + 안내 문구, 데이터 없으면 `PS.sample()`)을 읽는 시점에 그대로 수행해야 한다. 또 `saveOk`(저장 성공/실패 표시, 위 1번 표의 빠진 상태)를 커스텀 `storage.setItem`의 예외 처리와 연결하지 않으면 저장 실패 안내가 사라진다. **대응:** 커스텀 storage 어댑터를 직접 작성하고, 기존 v4 저장 데이터를 실제로 붙여넣어 열리는지 수동으로 확인한다.
5. **시뮬레이션 타이머 싱글턴 + 실행 중 화면 전환(N-04)** — 원본은 `job`(전역 `setInterval` 하나)만 존재하고, 콜백이 매번 `data.projects.find(...)`로 대상 실행을 찾아 없으면 스스로 멈춘다(실행 중 프로젝트 전환/실행 삭제 대비). React에서 `App`에 한 번만 마운트해야 하는데, Vite HMR이나 `StrictMode`의 effect 이중 실행으로 인터벌이 중복 생성되기 쉽고, 동시 실행 1개 제한(`startRun`의 가드)과 완료·실패 토스트의 버튼(결과 보기/실행 기록 보기)이 어떤 화면에 있든 동작해야 하는 요구가 함께 걸려 있다. **대응:** `useSimulationJob`에서 인터벌 생성을 ref로 가드해 중복 생성을 막고, 개발 모드에서 화면 전환·새로고침·프로젝트 전환 중 실행을 수동으로 반복 테스트한다.
