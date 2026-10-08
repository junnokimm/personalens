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
- 2026-10-07 [단계 4]: `useProjectStore`(zustand + immer + persist), `useUiStore`, `useSimulationJob`을 추가함. 계획(아래 "계획" 절 3번) 때 정리한 액션 이름을 그대로 씀.
  - `useProjectStore`는 `data`(=`{ projects: [...] }`)를 그대로 담고, `localStorage` 키 `personascope-proto-v4`에 원본과 같은 `{ projects: [...] }` 형태로 저장함. zustand `persist`가 기본으로 씌우는 `{ state, version }` 래퍼는 커스텀 `storage`(`getItem`/`setItem`에서 직접 JSON 문자열을 다룸, `zustand/middleware`의 `serialize`/`deserialize` 옵션은 v5에 없음)와 `partialize: (state) => ({ projects: state.projects })`로 없앰. `merge` 옵션 안에서 원본 `load()`과 같은 처리(저장된 데이터 없으면 `sample()`, `running` 실행은 `failed` + 안내 문구)를 함.
  - `saveOk`(저장 성공/실패)는 계획에서 적어 둔 대로 `useUiStore`에 둠. `useProjectStore`에 두면 커스텀 `storage.setItem` 안에서 `useProjectStore.setState`를 불러 persist가 그 변경을 다시 저장하려 하는 순환이 생기기 때문(persist는 `setState`를 감싸 모든 변경 뒤에 `storage.setItem`을 다시 부름).
  - 원본 `openRun()`이 초기화하던 항목(`qid`, `drill`, `pf`, `pSearch`, `pPage`, `personaId`)만 `resetResultsUi()`로 묶음. `segKey`/`segMode`/`pSort`/`pChatted`/`chatQid`/`respCol`/`distKey`/`CMP`/`mapColor`는 원본처럼 "렌더링 중 스스로 보정"되는 값이라 초기값만 두고, 실제 보정 로직은 화면 컴포넌트를 만들 때 `useMemo`로 넣기로 함(계획 절 "전환 시 위험한 부분" 2번).
  - `useSimulationJob`은 원본 `job`(전역 `setInterval` 핸들)과 같이 모듈 전역 변수로 타이머를 하나만 둠. `tick(projectId, runId)`로 데이터 변경(진행률·완료·실패)은 `useProjectStore` 액션 안에서 하고, 타이머 생성·완료·실패 토스트는 `useSimulationJob`에서 함. `startRun`/`retryRun`을 호출해 시작하고, `App`에 한 번 마운트하는 `useSimulationJob()` 훅은 새로고침 등으로 타이머가 끊긴 채 `running`인 실행이 남아 있으면 다시 이어서 돈다(원본은 `load()`가 이런 실행을 `failed`로 바꿔서 거의 일어나지 않지만, 개발 중 HMR 대비).
  - 토스트의 "결과 보기"/"실행 기록 보기" 버튼은 아직 `ConfirmModal`/`Toast` 컴포넌트가 없어(5단계), `useUiStore.toast.action`에 함수(`{ onClick }`, 예: 삭제 취소) 또는 이동할 경로(`{ to }`, 예: 완료·실패 토스트) 중 하나를 담아 두고 실제 버튼 클릭 처리는 5단계에서 구현하기로 함.
  - `tests/store.test.js` 추가. 문항 추가·삭제·삭제 취소, 실행 시작 때 설문 버전 확정, 실행 시작→완료, 실패 시연(`failNext`), 새로고침 시 `running`→`failed`, `localStorage` 비었을 때 예시 프로젝트 생성을 검사함. 스토어가 모듈을 import할 때 `localStorage`를 읽어 한 번만 만들어지는 싱글턴이라, 시나리오마다 `localStorage`를 먼저 채우고 `vi.resetModules()`로 모듈 캐시를 비운 뒤 다시 import해서 "새로고침"을 흉내 냄. vitest 기본 환경(`node`)엔 `localStorage`가 없어 `tests/setup.js`에 최소 메모리 구현을 두고 `vite.config.js`의 `test.setupFiles`로 연결함(새 라이브러리를 추가하지 않기 위해 `jsdom`은 쓰지 않음).
  - `tests/fixtures/legacy-v4-storage.json`(완료된 실행 1건)과 `legacy-v4-storage-running.json`(실행 중에 저장된 것처럼 `status`를 `running`으로 바꾼 것)을 `node:vm`으로 원본 `core.js`의 `PS.sample()`을 직접 실행해 만듦 — 실제로 원본 코드가 저장했을 값과 같은 방식으로 재현한 것이라, 브라우저로 원본을 열어 받아 온 값과 같은 구조임.
- 2026-10-07 [단계 5]: React Router(`CLAUDE.md` 라우트 표대로), 레이아웃(`Sidebar`/`Topbar`/`NavStatus`), 공통 컴포넌트(`Modal`/`ConfirmModal`/`Toast`/`Banner`/`PageHead`/`StatusTag`), 개요 화면(`ProjectsPage`/`SummaryPage`/`RunsPage`/`RunRow`)을 추가함.
  - 라우트는 `/`, `/p/:projectId`(요약), `/p/:projectId/runs`, `/p/:projectId/results/:runId?`, `/p/:projectId/design/survey`, `/p/:projectId/design/target`, `/p/:projectId/simulation`을 `App.jsx`에 구성함. `survey`/`target`/`simulation`/`results`는 아직 화면이 없어(6~9단계) 자리표시자(`Placeholder`)를 둠. 없는 프로젝트 ID로 들어오면 `ProjectGate`가 `/`로 돌려보냄(원본 `go()`의 처리와 같음).
  - 현재 페이지 종류(원본 `page` 전역 변수)는 각 라우트가 지나가는 경로 패턴으로 판단한다(`useRouteInfo` 훅, `useMatch` 사용). 처음에는 React Router의 `useMatches()` + 라우트 `handle`로 더 깔끔하게 짜려 했으나, `useMatches()`는 `createBrowserRouter`(데이터 라우터)에서만 동작하고 이 프로젝트는 `<BrowserRouter>`/`<Routes>`(선언형 라우터)를 쓰고 있어 실행 시 `"useMatches must be used within a data router"` 오류가 난다는 것을 `react-dom/server`의 `renderToStaticMarkup`으로 미리 렌더링해 확인하고 `useMatch` 방식으로 바꿈. 브라우저 확장이 연결되지 않아 실제 화면으로 띄워 보지 못한 상태에서도 이 방법으로 이 오류를 미리 잡을 수 있었음.
  - `FilterChips`(`components/filters/`)를 이번 단계에서 먼저 만듦. 원래 7단계("조건 선택 팝업") 몫이지만, 조건 칩 표시 자체는 `conditions.js`의 `filterChips`/`valueText`/`fieldLabel`만으로 독립적으로 동작하고 `SummaryPage`가 당장 필요해서 가져옴. 조건을 "선택"하는 팝업(`FilterModal`, `openFilterModal` 등)은 그대로 7단계에서 만든다.
  - 토스트의 "결과 보기"/"실행 기록 보기" 버튼: `useUiStore.toast.action`이 `{ to }`(이동할 경로)면 `Toast`가 `useNavigate()`로 이동하고, `{ onClick }`(예: 문항 삭제 취소)이면 그 함수를 직접 부름.
  - **확인 못 한 것:** 이 환경에서 Claude in Chrome 브라우저 확장이 연결되지 않아("Browser extension is not connected") 원본과 새 화면을 나란히 열어 보는 5번 비교 작업을 실제로 하지 못함. 대신 원본 템플릿 문자열과 새 JSX를 한 줄씩 대조하고, `react-dom/server`의 `renderToStaticMarkup`으로 `App`을 실제로 렌더링해 오류 유무를 확인함(위 `useMatches` 문제를 이 방법으로 찾아 고침). `npm run dev`는 5180 포트에서 정상 기동 확인(`curl`로 `index.html` 응답만 확인, 화면은 못 봄). **나중에 할 일:** 브라우저로 직접 열어 원본과 나란히 비교하고, 특히 모바일 폭(≤760px)에서 사이드바가 가로 메뉴로 바뀌고 현재 메뉴가 스크롤되어 보이는지 확인 필요.
- 2026-10-07 [단계 6]: 설문 편집 화면(`pages/design/SurveyPage.jsx`, `QuestionBlock.jsx`)을 추가함. 메타 정보 카드, 버전 선택기(이전 버전 불러오기 + 버전별 실행 수 + 확인 모달), `v2 편집 중` 류 표시, 문항 접기·펼치기, ↑↓ 이동, 후속 질문 추가(Q1-1 번호), 인라인 오류 + 상단 오류 요약 + "이동" 링크를 옮김. 액션(`editS`/`editQ`/`changeType`/`editOpt`/`addOpt`/`delOpt`/`addQ`/`addFollow`/`moveQ`/`deleteQ`/`undoDelete`/`restoreVersion`)은 4단계에서 만든 `useProjectStore` 액션을 그대로 씀.
  - 원본은 문항을 추가하거나(`addQ`/`addFollow`) 선택지를 추가한(`addOpt`) 뒤 `render()`로 전체를 다시 그린 다음 `$('#t-...')`/`$('#o-...')`에 `focus()`를 부르고, 오류 요약의 "이동" 링크(`focusQ`)는 그 문항을 펼친 뒤 `scrollIntoView`한다. React는 상태 변경과 실제 DOM 반영이 같은 틱에 끝나지 않아(리렌더가 비동기로 커밋됨) 그 자리에서 바로 `focus()`를 부르면 아직 없는/닫힌 엘리먼트를 대상으로 하게 된다. `pages/design/useFocusAfterRender.js`에 "다음 커밋 뒤 이 id를 포커스/스크롤하라"를 적어 두는 작은 훅을 만들어 이 네 자리(`addQ`, `addFollow`, `addOpt`, 오류 "이동")에서 재사용함.
  - **한글 입력 확인:** 입력칸(`#s-title`, `#s-desc`, 문항 `textarea`, `low`/`high`, 선택지)은 모두 `value`로 직접 묶인 제어 컴포넌트이고, 타이핑하는 동안 `q.type`이 바뀌지 않는 한 그 자리의 JSX 구조(보이는 필드 종류·개수)가 바뀌지 않으며 목록 `key`(문항 id, 선택지는 인덱스)도 타이핑 중에는 바뀌지 않는다. 즉 React가 같은 DOM 노드를 계속 재사용하므로 글자 입력 중 엘리먼트가 다시 만들어질 일이 없다 — 원본이 `render()`로 `innerHTML` 전체를 새로 그리면서 초점·커서를 수동으로 복원해야 했던 문제(`REVISION_NOTES.md`의 "한글 입력 수정") 자체가 React 구조에서는 생기지 않는다(전환 규칙 7번이 예상한 그대로). **다만 이 환경은 브라우저 확장이 연결되지 않아 "한글 입력 테스트"를 실제로 타이핑해 보며 확인하지는 못했다.** `npm run dev`로 직접 열어 설문 주제·목적, 질문 내용, 척도 양끝 이름, 선택지 칸에 한글을 입력하면서 낱자가 깨지거나 포커스가 빠지지 않는지 확인이 필요하며, 문제가 있으면 `fix(survey)` 커밋을 추가로 만들어야 한다(이번에는 고칠 것을 찾지 못해 만들지 않음).
- 2026-10-07 [단계 7]: `conditions.js` 전체를 `components/filters/`로 옮기고(`FilterModal.jsx`, `Big5Range.jsx`, `RegionPicker.jsx`, `filterModalHelpers.js`), `TargetPage`/`GroupPreview`/`components/map/KoreaMap`/`SimulationPage`를 추가함.
  - 전역 `FM`은 `FilterModal`이 여는 시점의 설정(`mode`/`title`/`filters`/`run`/`base`/`need`/`onApply`, 원본 `openFilterModal`의 인자)과 그 안에서 편집 중인 상태(`draft`/`history`/`search`/`optSearch`/`limit`/`active`)로 나눔. 전자는 `useUiStore.filterModal`(`ConfirmModal`의 `confirm`과 같은 자리)에, 후자는 `FilterModal` 컴포넌트의 `useState`에 둠. `App.jsx`에서 `filterModal`을 열 때마다 `key={filterModal}`로 새로 마운트해서, 열 때마다 `draft` 등을 새로 계산하던 원본 `FM = {...}`와 같은 효과를 냄.
  - `fmBig5`(단계 버튼 클릭, 되돌리기 기록을 남김)과 `fmBig5Soft`(슬라이더를 끄는 동안, 기록을 남기지 않음)의 차이를 `Big5Range`의 `onLevelClick`/`onRangeChange` 두 콜백으로 나눠 그대로 옮김 — 슬라이더는 끄는 동안 숫자·인원만 갱신하고 떼었을 때만 "확정"된다는 요구사항이 애초에 두 콜백이 분리돼 있어서 자연히 지켜짐.
  - 원본은 검색어 입력 중(`fmRefreshOpts`)이나 포커스가 있을 때 전체를 다시 그리면 초점이 끊기는 것을 막기 위해 목록 부분만 따로 다시 그렸다. React는 같은 이유(전환 규칙 7번)로 이 최적화가 필요 없어서 옮기지 않음 — 검색창도 평범한 제어 입력으로 둠.
  - `distKey`(대상 집단 분포 미리보기 기준)는 4단계 계획대로 "스스로 보정"하지 않고, `GroupPreview`에서 표시할 때만 유효하지 않으면 기본값을 계산해서 쓰고 사용자가 실제로 바꿀 때만 `useUiStore`에 씀.
  - `components/map/KoreaMap.jsx`는 이번 단계에서 요청한 대로 미리보기용 `miniMap()`만 옮김. 집단 나누기의 전체 지도(`mapView`)는 결과 화면을 만드는 8단계에서 이 컴포넌트에 모드를 추가해 합칠 계획(폴더 구조 메모에 적힌 대로).
  - **확인 방법:** 이번에도 브라우저 확장이 연결되지 않아 직접 클릭해 보지 못함. 대신 `react-dom/server`의 `renderToStaticMarkup`으로 `FilterModal`을 독립적으로(대상 집단 모드 — 카테고리/Big5/지역 활성 상태 각각, 페르소나 모드) 직접 렌더링해 오류 없이 나오는지, 조건 칩·값 목록·지역 부모/자식 체크 상태·T점수 범위 문구가 원본과 같은 모양으로 나오는지 확인함(이 방법은 `useProjectStore`를 거치는 화면 전체 트리에는 쓸 수 없어 `TargetPage`/`SimulationPage`는 코드 대조로만 확인). "실행 시작 뒤 다른 화면으로 옮겨도 진행률이 사이드바에 계속 오르고 토스트가 뜨는지"는 `Sidebar`/`Toast`가 라우트와 무관하게 `RootShell`에 항상 마운트돼 있고 전역 스토어를 구독하는 구조로 이미 5단계에서 보장돼 있음(새 코드 없음) — 브라우저로 직접 눌러 보는 확인은 아직 못함. **나중에 할 일:** 브라우저로 조건 팝업의 모든 상호작용(검색, 값 검색, Big5 슬라이더, 지역 부모/자식, 되돌리기)과 대상 집단·시뮬레이션 화면, 실행 중 화면 전환을 직접 확인.
- 2026-10-07 [단계 8]: 결과 화면의 전체 결과·집단 분석·지역 지도를 옮김(`pages/results/`의 `ResultsPage`, `QuestionTabs`, `OverallView`, `ResponseComparison`, `Trail`, `SegmentView`, `components/charts/`의 `PairBars`·`SegGap`, `components/map/KoreaMap.jsx`의 `KoreaMapFull`).
  - `view`(전체 결과/집단 분석/페르소나/내보내기)는 라우트 표대로 URL 쿼리(`?view=`)로 옮김. 원본 `openRun()`이 하던 초기화(`qid`/`drill`/`pf`/`pSearch`/`pPage`/`personaId`)는 5·7단계에서 이미 만든 `resetResultsUi()`를 "결과 보기" 진입점(Sidebar·SummaryPage·RunsPage·RunRow·SimulationPage)마다 부르는 것으로 처리돼 있어 이번 단계에서 새로 할 일은 없었음.
  - `qid`(지금 보는 문항), `segKey`(나눌 기준), `CMP`(선택지 비교 A/B·속성)는 원본에서 실행·문항이 바뀌면 렌더링 중에 전역을 직접 보정해 항상 유효한 값으로 맞췄다. 전환 규칙 2번대로, 이 보정을 store에 쓰지 않고 표시할 때만 "유효하지 않으면 기본값" 계산으로 대신했다(`OverallView`/`SegmentView`/`ResponseComparison`에 각각 `effectiveQid`/`effectiveSegKey`/`effectiveCmp` 계산). 사용자가 실제로 문항·기준·속성을 고를 때만 `useUiStore`에 씀.
  - 탭(전체 결과/페르소나/내보내기)은 `drill`을 건드리지 않고 URL의 `view`만 바꾸므로, 탭을 오가도 탐색 경로(드릴다운)가 원본처럼 그대로 유지된다. "전체 결과" 탭을 다시 누르면 `drill.answer`가 있으면 집단 분석(`segment`)으로, 없으면 전체 결과로 돌아가는 원본 분기도 그대로 옮김.
  - 지역 지도(`KoreaMapFull`)의 마우스 움직임에 따른 말풍선 위치·지도 위 강조(`hi` 클래스)는 원본처럼 `document.querySelector`로 직접 DOM을 건드리지 않고, 호버 중인 지역 이름과 말풍선 좌표를 컴포넌트 지역 state로 들고 있다가 그 값으로 렌더링한다(오른쪽 목록에 마우스를 올리면 지도 위 해당 path를 찾아 그 위치를 계산 — 원본 `mapHi`와 같은 처리).
  - **확인 방법:** `react-dom/server`의 `renderToStaticMarkup`으로 `OverallView`/`ResponseComparison`/`SegmentView`/`KoreaMapFull`을 실제 표본 데이터로 렌더링해 오류 없이 나오는지, 지도 색 분류(`m-s1~4`/`m-n1~3`/`m-p1~3`/`m-small`/`m-empty`)·범례·목록 정렬(표본 적은 지역을 뒤로)·선택지 비교의 차이 큰 속성 Top3·표본 경고 문구가 원본과 같은 값으로 나오는지 확인함. 이번에도 브라우저 확장이 연결되지 않아 실제 마우스 호버·클릭·키보드 포커스 동작은 직접 확인하지 못함. **나중에 할 일:** 브라우저로 응답 막대 클릭 → 집단 분석, 탐색 경로 되돌아가기, 표/차트/지도 전환, 지도 호버 툴팁과 키보드 포커스, 선택지 비교의 선택 바꾸기를 직접 확인.
- 2026-10-07 [단계 9]: 페르소나 목록·상세·인터뷰(`PersonasView`, `DetailView`, `ChatView`, `PeopleTrail`, `ResponseItems`)와 CSV 내보내기(`ExportView`)를 옮김.
  - **8단계 노트의 정정:** "`qid` 초기화는 5·7단계에서 새로 할 일이 없었다"고 적었는데, 실제로는 틀렸다. `resetResultsUi()`가 `qid`를 원본 `openRun()`처럼 "그 실행의 첫 비주관식 문항"으로 맞추지 않고 그냥 `null`로만 비웠었다. 원본 `personaList()`도 `respCol`이 비어 있으면 `qid`로 대신하는데, 원본에서는 `openRun()`이 `qid`를 항상 유효하게 미리 맞춰 두기 때문에 문제가 없었던 것— 즉 "렌더링 중 보정"이 아니라 "이동할 때 한 번 보정"이라, 결과 화면에 들어가자마자 바로 "페르소나" 탭을 누르면(전체 결과를 거치지 않고) `qid`가 `null`인 채로 `PersonasView`가 열려 `qLabel(run.survey, undefined)`에서 죽는 실제 버그였다. `react-dom/server`의 `renderToStaticMarkup`으로 `PersonasView`를 렌더링해 보다가 바로 이 오류로 찾아냄. `resetResultsUi(run)`이 `run`을 받아 `qid`를 계산하도록 고치고, `resetResultsUi`를 부르는 7곳(Sidebar·SummaryPage·RunsPage·RunRow·SimulationPage·ResultsPage) 모두 실행 객체를 넘기도록 맞췄다. `PersonasView`/`ChatView`의 `qid` 사용처에도 자체 기본값 계산을 추가해 이중으로 막음.
  - "대화" 키는 원본과 같이 `project.chats[runId + '::' + personaId]`. `ask`는 4단계에서 만든 `useProjectStore.ask` 액션을 그대로 씀(텍스트 생성 포함, AI 연결 없음).
  - **CSV 바이트 비교:** `tests/csv-export-parity.test.js`를 추가함. 같은 저장 데이터(`tests/fixtures/legacy-v4-storage.json`)를 `node:vm`으로 돌린 원본 `PSCSV.exportCsv`와 `src/lib/csv.js`의 `exportCsv`에 똑같이 넣어 wide/long/codebook 세 형식 모두 `Buffer`로 바이트 단위까지 비교함 — 전부 일치. 브라우저로 실제 다운로드 파일을 받아 비교하지는 못했지만(확장 미연결), 같은 입력에 대한 CSV 생성 함수 자체가 바이트 단위로 같다는 것은 이 테스트로 확정적으로 확인됨(다운로드 파일명·Blob 포장은 코드 대조로만 확인).
  - `PersonasView`/`ExportView`는 `renderToStaticMarkup`으로 실제 표본 데이터를 넣어 정상 렌더링을 확인함(페이지네이션, 정렬, 응답 열, 대화 건수 배지까지 원본과 같은 값). `DetailView`/`ChatView`는 보여줄 페르소나를 고르는 `personaId`가 store에 있어 이 렌더 방법으로는 "찾음" 쪽 경로를 실제로 통과시켜 보지 못했고(여기서도 zustand의 `getServerSnapshot`이 가로채는 같은 제약), 대신 "못 찾음 → 페르소나 목록으로 대체" 경로는 확인했고 나머지는 원본과 줄 단위로 대조함. **나중에 할 일:** 브라우저로 페르소나 목록 검색·정렬·페이지·행 클릭(키보드 Enter 포함), 상세·인터뷰 화면 전환과 "이 응답에 대해 묻기", 추천 질문·직접 입력 전송, CSV 실제 다운로드까지 직접 확인.
- 2026-10-07 [단계 10]: 마무리 정리. Claude in Chrome 브라우저 확장이 이번 단계에서 연결되어, 5~9단계에서 "나중에 할 일"로 미뤄 뒀던 실제 브라우저 확인(한글 입력, Big5 슬라이더, 조건 팝업, 지도 호버, 시뮬레이션 실행/실패/재시도/화면 전환, 페르소나·상세·인터뷰, CSV 내보내기 UI)을 `npm run dev`(포트 5180)와 `legacy/`를 `python3 -m http.server`로 띄운 사본(포트 5190)을 나란히 열어 전부 수행함.
  - **원본 비교 체크리스트 결과** (`PROMPTS.md` 맨 아래, 31개 항목 모두 통과):

    | 분류 | 항목 | 결과 | 확인 방법 |
    | --- | --- | --- | --- |
    | 저장과 기본 흐름 | 원본 localStorage 데이터가 그대로 열림 | 통과 | `javascript_tool`로 `personascope-proto-v4` 값을 직접 넣고 새로고침 → `{projects:[...]}` 그대로 열림 |
    | | "예시 데이터 다시 만들기"가 원본과 같은 예시 프로젝트를 만듦 | 통과 | 브라우저로 클릭해 확인 + 코드 대조(`ProjectsPage.jsx` vs `app.js:110`) |
    | | 상단 바 "자동 저장됨", 경로는 `프로젝트 / 메뉴`만 표시 | 통과 | 브라우저 화면 확인 |
    | | 실행 중 새로고침 → 그 실행이 실패로 바뀌고 안내 문구 | 통과 | 새 실행 시작 직후 새로고침 → 실행 기록에 "실패 · 페이지를 새로 열어 실행이 멈췄습니다" 표시 확인(자동화 테스트로도 `tests/store.test.js`에서 검사) |
    | 사이드바 | 개요·설계·시뮬레이션 한 줄 구조 | 통과 | 브라우저 화면 확인 |
    | | 설문·대상 집단 상태 표시(✓/!/v2 편집 중/구성 필요)가 원본과 같음 | 통과 | 브라우저로 각 상태 재현해 확인 |
    | | 모바일 폭 가로 스크롤 메뉴 + 현재 메뉴 스크롤 | 코드 대조로만 확인 | 이 환경은 `resize_window`가 실제 뷰포트 크기를 바꾸지 못해(고정 해상도 가상 디스플레이) 760px 이하를 브라우저로 직접 재현하지 못함. CSS는 2단계에서 원본과 바이트 동일 확인됐고, `Sidebar.jsx`의 `matchMedia('(max-width: 760px)')` 분기는 원본 로직을 그대로 옮김(5단계) — 코드 수준에서는 동일 |
    | 설문 | 입력 중 버전 안 오르고 'v2 편집 중' 표시, 실행 때 확정 | 통과 | 브라우저로 문항 수정 후 상태 확인, 실행 후 버전 확정 확인 |
    | | 후속 질문 번호(Q1-1), 같은 부모 안에서만 ↑↓ | 통과 | 브라우저 확인 |
    | | 인라인 오류 + 상단 요약 + "이동" 링크 | 통과 | 빈 문항으로 만들어 오류 재현, "이동" 클릭해 포커스 이동 확인 |
    | | 삭제 후 "삭제 취소" 동작 | 통과 | 브라우저 확인 |
    | | 이전 버전 불러오기와 버전별 실행 수 | 통과 | 브라우저 확인 |
    | | 모든 입력칸에서 한글 정상 입력 | 통과 | 설문 제목·설명, 문항 텍스트, 척도 양끝 이름, 선택지에 직접 한글 타이핑해 조합 깨짐 없음 확인(`textarea` 포함) |
    | 대상 집단과 조건 팝업 | 집단 만들기·복제·삭제·이름 바꾸기 | 통과 | 브라우저 확인 |
    | | 실시간 인원 추정, 0명 안내, "마지막 변경 되돌리기" | 통과 | 조건 추가/해제하며 인원 변화, 0명 조건 만들어 안내 문구, 되돌리기 확인 |
    | | Big5 5단계 버튼과 20~80점 슬라이더 | 통과 | 버튼 클릭(기록 남음)과 슬라이더 드래그(떼었을 때만 확정) 둘 다 확인 |
    | | 지역 정식 이름, 내부 키 노출 안 됨 | 통과 | 브라우저 확인 |
    | | 분포 미리보기와 지역 작은 지도, 조건 변경 시 흐림 + 경고 | 통과 | 브라우저 확인 |
    | | 서술형 조건 미적용 안내 | 통과 | 브라우저 확인 + 코드 대조(`FilterModal.jsx` vs `conditions.js:98`, 문구 동일) |
    | 시뮬레이션 | 실행 전 확인 팝업, 직전 실행 비교, 같은 설정 안내 | 통과 | 동일 설정으로 2회 실행 시도해 "실행 #N과 설정이 같습니다" 배너 확인 + 코드 대조(`SimulationPage.jsx` vs `app.js:288`) |
    | | 실행 중 화면 이동 가능, 사이드바 진행률, 완료 토스트 "결과 보기" | 통과 | 실행 중 다른 메뉴로 이동 후에도 진행률 유지, 완료 토스트 버튼 클릭해 결과로 이동 확인 |
    | | 실패 시연 → 60%에서 실패, 실행 기록 "다시 시도" | 통과 | 브라우저 확인 |
    | | 진행 중일 때 새 실행 막힘 | 통과 | 브라우저 확인 |
    | 결과 | 실행 정보 띠의 실행 선택, 탭 3개 | 통과 | 브라우저 확인 |
    | | 응답값 "4점 / 5", 경로·칩에서 "Q1-1 · 4점 / 5" | 통과 | 브라우저 확인 |
    | | 막대 클릭 → 집단 분석, 경로 단계별 인원, 단계 클릭 복귀 | 통과 | 브라우저 확인 |
    | | 이 집단/비교 기준/차이 열, 표·차트·지도 전환 | 통과 | 브라우저 확인 |
    | | 표본 경고·"기준 충족", 5명 미만 흐림, 10%p 이상 강조 | 통과 | 표본 적은 조건 만들어 경고·흐림 확인 |
    | | 지도 색 기준 전환, 툴팁(키보드 포함), 클릭 좁히기, 목록 hover 강조 | 통과 | 마우스 호버·클릭, Tab으로 지도 path 포커스해 툴팁 확인 |
    | | 선택지 비교 Top 3, '유의' 표현 없음 | 통과 | 브라우저 확인 |
    | | 페르소나 필터 바, 즉시 검색, 행 클릭·Enter, 대화한 페르소나만, 응답 열 선택 | 통과 | 검색어 타이핑 즉시 반영, 키보드 Enter로 상세 진입 확인 |
    | | 상세 Big5 T점수 막대, "이 응답에 대해 묻기" | 통과 | 브라우저 확인 |
    | | 인터뷰 기준 문항 선택, 추천 질문, 답변 인용 문구, 대화 저장 | 통과 | 추천 질문 클릭·직접 입력 둘 다 확인, 새로고침 후에도 대화 유지 확인 |
    | | CSV 세 형식이 원본과 같은 내용·파일명 | 통과 | 바이트 단위 비교는 `tests/csv-export-parity.test.js`(3형식 모두 원본과 동일), 버튼 라벨·순서는 브라우저로 대조 |
    | 마무리 | `npm test`(회귀 테스트 포함) 통과 | 통과 | 40개 전체 통과 |
    | | `npm run build` 통과 | 통과 | 통과(번들 크기 경고는 기능과 무관한 안내이며, 코드 분할은 이번 범위 밖이라 그대로 둠) |
    | | 개발 서버 콘솔 오류 없음 | 통과 | 전체 화면을 돌며 `read_console_messages`로 확인, 앱과 무관한 크롬 확장 로그 1건 외 없음 |

  - **정리한 코드:** `App.jsx`의 미사용 `Placeholder` 함수(5단계에서 자리표시자로 썼고 6~9단계에서 실제 화면으로 모두 교체된 뒤 지우지 않고 남아 있던 죽은 코드)와, 각 `<Route>`의 `handle={{ page: ... }}`(5단계에서 `useMatches()`용으로 넣었다가 데이터 라우터가 아니라 못 쓰게 되어 `useMatch` 방식(`useRouteInfo.js`)으로 바꾸면서 참조가 사라진 죽은 prop)를 지움. 그 외 `console.log`/`debugger`/`TODO` 등 임시 코드, 미사용 export, 스크래치 파일은 전체 검색 결과 없음.
  - **300줄 초과 컴포넌트:** 없음(가장 긴 `components/filters/FilterModal.jsx`가 226줄).
  - **모바일 반응형 확인의 한계:** 이 작업 환경의 브라우저 확장은 `resize_window`를 호출해도 실제 뷰포트가 고정 가상 디스플레이 해상도(1419×780)에 머물러 760px 이하 폭을 실제로 재현할 수 없었다. CSS(2단계에서 원본과 바이트 동일 확인)와 `Sidebar.jsx`의 미디어 쿼리 분기 로직(5단계에서 원본 그대로 포팅)을 근거로 코드 수준에서는 동일하다고 판단했지만, 실제 기기나 뷰포트 크기 조절이 되는 환경에서 한 번 더 눈으로 확인하는 것을 권장한다(README의 "시연용 한계"에는 포함하지 않음 — 이는 전환 작업 환경의 한계이지 제품 자체의 한계가 아니므로).
  - `README.md`를 새로 작성함(실행 방법, 폴더 구조, 원본과 달라진 점, `lib/config.js` 안내, 시연용 한계 요약).

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
