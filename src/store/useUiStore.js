import { enableMapSet } from 'immer'
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

enableMapSet()

/* 원본 openRun()이 초기화하는 항목 */
const initialResultsUi = {
  qid: null,
  drill: { answer: null, attrs: [] },
  pf: {},
  pSearch: '',
  pPage: 0,
  personaId: null,
}

/* openRun()이 초기화하지 않는, "렌더링 중 스스로 보정"되던 나머지 결과 화면 상태 — 초기값만 원본과 같게 둔다 */
const otherResultsUi = {
  segKey: 'sex',
  segMode: 'table',
  pSort: 'id',
  pChatted: false,
  chatQid: null,
  respCol: null,
  distKey: '',
  cmp: { key: '', a: 0, b: 1, attr: '', showAll: false },
  mapColor: 'gap',
}

export const useUiStore = create(immer((set) => ({
  ...initialResultsUi,
  ...otherResultsUi,

  /* 저장되지 않는 화면 상태 */
  openQs: new Set(),
  lastDeleted: null,
  failNext: false,
  saveOk: true,
  confirm: null, // { title, body, ok, danger, onOk } | null
  toast: null, // { text, actionLabel, action } | null — action: { onClick } | { to } | null
  filterModal: null, // 원본 FM — { mode, title, filters, start, need?, run?, base?, onApply } | null

  /* ---------- 결과 화면 ---------- */
  setResultsUi(partial) { set((state) => { Object.assign(state, partial) }) },
  /* 원본 openRun(id): run을 넘기면 qid를 그 실행의 첫 비주관식 문항으로 맞춘다(원본과 같은 시점의 초기화) */
  resetResultsUi(run) {
    set((state) => {
      state.qid = run ? (run.survey.questions.find((q) => q.type !== 'text')?.id ?? run.survey.questions[0].id) : initialResultsUi.qid
      state.drill = { answer: null, attrs: [] }
      state.pf = {}
      state.pSearch = ''
      state.pPage = 0
      state.personaId = null
    })
  },

  /* ---------- 설문 편집 중 열린 문항 ---------- */
  toggleOpenQ(id) { set((state) => { state.openQs.has(id) ? state.openQs.delete(id) : state.openQs.add(id) }) },
  openQ(id) { set((state) => { state.openQs.add(id) }) },

  /* ---------- 문항 삭제 취소 ---------- */
  setLastDeleted(value) { set((state) => { state.lastDeleted = value }) },

  /* ---------- 시뮬레이션 시연 옵션 ---------- */
  setFailNext(value) { set((state) => { state.failNext = value }) },

  /* ---------- 저장 상태 ---------- */
  setSaveOk(value) { set((state) => { state.saveOk = value }) },

  /* ---------- 토스트 ---------- */
  showToast(text, actionLabel, action) {
    set((state) => { state.toast = { text, actionLabel: actionLabel ?? null, action: action ?? null } })
  },
  hideToast() { set((state) => { state.toast = null }) },

  /* ---------- 확인 모달 ---------- */
  openConfirm({ title, body, ok = '확인', danger = false, onOk }) {
    set((state) => { state.confirm = { title, body, ok, danger, onOk } })
  },
  closeConfirm() { set((state) => { state.confirm = null }) },

  /* ---------- 조건 선택 팝업 ---------- */
  openFilterModal(opts) { set((state) => { state.filterModal = opts }) },
  closeFilterModal() { set((state) => { state.filterModal = null }) },
})))
