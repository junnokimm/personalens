# 개발 문서

## 폴더 구조

```
legacy/                 원본 v4 프로토타입 (읽기 전용, 비교 기준)
docs/MIGRATION_NOTES.md 전환 진행 기록·원본과 다른 점·나중에 할 일
src/
├─ main.jsx, App.jsx    진입점, 레이아웃·라우트 구성
├─ data/                페르소나 스키마·지도 데이터(JSON)
├─ lib/                 화면과 무관한 순수 계산 로직(원본 core.js·csv.js·comparison.js)
├─ store/               Zustand 스토어(저장되는 데이터, 화면 상태, 시뮬레이션 타이머)
├─ components/          레이아웃·공통 UI·조건 팝업·지도·차트
├─ pages/                화면(프로젝트 목록, 개요, 설문·대상 집단 설계, 시뮬레이션, 결과)
├─ utils/                포맷 함수
└─ styles/global.css    원본 스타일시트 그대로
tests/                   Vitest 테스트(원본과 결과 비교 포함)
```

## 원본과 달라진 점

기능·문구·화면 구성은 원본과 동일하게 유지했습니다. 다음은 전환 과정에서 생긴 구조적인 차이로, 동작에는 영향이 없습니다.

- **URL 기반 라우팅.** 원본은 전역 변수(`page`, `projectId` 등)로 화면을 전환했지만, 여기서는 React Router로 각 화면이 실제 경로를 가집니다. 결과 화면은 선택한 문항·응답·드릴다운·페르소나·인터뷰 기준 문항도 쿼리에 남겨 새로고침과 브라우저 뒤로 가기에서 복원합니다(원본에는 없던 변화, 의도한 개선). 다만 데이터 자체는 각자 브라우저의 `localStorage`에만 저장되므로, 이 링크를 다른 사람이나 다른 브라우저·기기에서 열면 같은 프로젝트·실행 데이터가 없어 복원되지 않습니다 — **같은 브라우저에서 새로고침하거나 뒤로 갈 때만** 의미가 있는 기능입니다.
- **저장 형식은 동일.** `localStorage`의 키와 `{ projects: [...] }` 구조는 원본과 같아서, 원본에서 내보낸 저장 데이터를 그대로 붙여 넣어도 열립니다.
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

## 원본(legacy/) 실행 방법

`legacy/index.html`을 브라우저로 직접 열면 됩니다(서버 불필요). `localStorage` 키(`personascope-proto-v4`)가 React 버전과 같아서 서로의 저장 데이터를 그대로 불러올 수 있습니다.
