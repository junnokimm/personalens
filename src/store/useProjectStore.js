import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

import { answerOf } from '../lib/analysis.js'
import { buildCohort as libBuildCohort, group as makeGroup, groupError } from '../lib/cohort.js'
import { clone, uid } from '../lib/random.js'
import { sample } from '../lib/sample.js'
import { attrValue } from '../lib/schema.js'
import { createRun } from '../lib/simulation.js'
import { answerText, lockVersion, ordered, qLabel, question } from '../lib/survey.js'
import { useUiStore } from './useUiStore.js'
import { getSessionIdentity, projectApi, surveyContent } from '../lib/projectApi.js'
import { createProjectSync } from './projectSync.js'
import { createServerRunActions } from './serverRuns.js'

const STORE_KEY = 'personascope-proto-v4'
const DEMO_KEY = 'personalens-demo-results-v1'
export const SERVER_STORAGE = import.meta.env.VITE_STORAGE_MODE !== 'local'

function asServerDraft(project) {
  return { ...project, survey: { ...surveyContent(project.survey), version: 0, history: [], draft: true } }
}

/* 원본 touch(): 프로젝트를 고치는 거의 모든 액션 끝에서 updated를 갱신합니다 */
function touchProject(project) {
  project.updated = new Date().toISOString()
}

/* 원본 load(): 저장된 데이터가 있으면 그대로, 없으면 예시 프로젝트. running 실행은 failed로 */
function migrateProjects(persistedProjects) {
  const projects = persistedProjects?.length ? persistedProjects : [sample()]
  return projects.map((p) => ({
    ...p,
    runs: p.runs.map((r) => (r.status === 'running' && !r._server ? { ...r, status: 'failed', failNote: '페이지를 새로 열어 실행이 멈췄습니다.' } : r)),
  }))
}

/* localStorage에 원본과 같은 { projects: [...] } 형태로 그대로 저장(persist의 { state, version } 래퍼를 쓰지 않음) */
const storage = {
  getItem: (name) => {
    let raw
    try { raw = localStorage.getItem(name) } catch { return null }
    if (raw == null) return null
    try { return { state: JSON.parse(raw), version: 0 } } catch { return null }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, JSON.stringify(value.state))
      useUiStore.getState().setSaveOk(true)
    } catch {
      useUiStore.getState().setSaveOk(false)
    }
  },
  removeItem: (name) => { try { localStorage.removeItem(name) } catch { /* 저장소 없음 */ } },
}

const projectState = immer((set, get) => ({
      ...(SERVER_STORAGE ? createServerRunActions(set, get, () => projectSync) : {}),
      projects: [],
      dataStatus: SERVER_STORAGE ? 'loading' : 'ready',
      loadError: '',
      sync: { ready: false, storageError: false, projects: {} },

      async loadProjects() {
        if (!SERVER_STORAGE) return
        set({ dataStatus: 'loading', loadError: '' })
        try {
          // Rebuild the account-scoped sync after a development hot reload as well.
          if (!projectSync && getSessionIdentity()) initializeSession(getSessionIdentity())
          if (!projectSync) throw Error('로그인 상태를 확인하려면 페이지를 새로고침하세요.')
          await projectSync.load()
          await get().refreshRuns()
          set({ dataStatus: 'ready' })
        } catch (error) {
          set({ dataStatus: 'error', loadError: error.message })
        }
      },
      retrySave(id) { return projectSync?.retry(id) },
      reloadProject(id) { return projectSync?.reloadProject(id) },
      flushSaves() { return projectSync?.flushAll() },
      importLegacy() {
        let legacy
        try { legacy = JSON.parse(localStorage.getItem(STORE_KEY)) } catch { return }
        if (!Array.isArray(legacy?.projects) || !legacy.projects.length) return
        set((state) => {
          for (const original of migrateProjects(legacy.projects)) {
            state.projects.unshift(asServerDraft({ ...clone(original), id: uid('project'), name: original.name + ' (가져온 사본)' }))
          }
        })
      },

      /* ---------- 프로젝트 ---------- */
      newProject(name, description) {
        const g = makeGroup('기본 집단')
        const p = {
          id: uid('project'), name, description, updated: new Date().toISOString(),
          survey: { title: '', description: '', version: 0, draft: true, history: [], questions: [] },
          groups: [g], activeGroupId: g.id, runs: [], chats: {},
        }
        set((state) => { state.projects.unshift(p) })
        return p.id
      },
      resetDemo() {
        set((state) => {
          if (SERVER_STORAGE) state.projects.unshift(asServerDraft(sample()))
          else state.projects = [sample()]
        })
      },
      touch(projectId) {
        set((state) => {
          const p = state.projects.find((x) => x.id === projectId)
          if (p) touchProject(p)
        })
      },

      /* ---------- 설문 ---------- */
      editS(projectId, key, value) {
        set((state) => {
          const p = state.projects.find((x) => x.id === projectId); if (!p) return
          p.survey[key] = value; p.survey.draft = true; touchProject(p)
        })
      },
      editQ(projectId, qid, key, value) {
        set((state) => {
          const p = state.projects.find((x) => x.id === projectId); if (!p) return
          const q = p.survey.questions.find((x) => x.id === qid); if (!q) return
          q[key] = value; p.survey.draft = true; touchProject(p)
        })
      },
      changeType(projectId, qid, type) {
        set((state) => {
          const p = state.projects.find((x) => x.id === projectId); if (!p) return
          const q = p.survey.questions.find((x) => x.id === qid); if (!q) return
          q.type = type
          if (type === 'choice' && q.options.length < 2) q.options = ['선택지 1', '선택지 2']
          p.survey.draft = true; touchProject(p)
        })
      },
      editOpt(projectId, qid, idx, value) {
        set((state) => {
          const p = state.projects.find((x) => x.id === projectId); if (!p) return
          const q = p.survey.questions.find((x) => x.id === qid); if (!q) return
          q.options[idx] = value; p.survey.draft = true; touchProject(p)
        })
      },
      addOpt(projectId, qid) {
        set((state) => {
          const p = state.projects.find((x) => x.id === projectId); if (!p) return
          const q = p.survey.questions.find((x) => x.id === qid); if (!q) return
          q.options.push('선택지 ' + (q.options.length + 1)); p.survey.draft = true; touchProject(p)
        })
      },
      delOpt(projectId, qid, idx) {
        set((state) => {
          const p = state.projects.find((x) => x.id === projectId); if (!p) return
          const q = p.survey.questions.find((x) => x.id === qid); if (!q) return
          q.options.splice(idx, 1); p.survey.draft = true; touchProject(p)
        })
      },
      /* 새 척도형 문항은 기본값(5점) 대신 바로 앞쪽에서 가장 가까운 척도형 문항의 점수 수·양끝 이름을 이어받는다 */
      addQ(projectId, type) {
        const q = question(type)
        if (type === 'likert') { q.low = '전혀 그렇지 않다'; q.high = '매우 그렇다' }
        set((state) => {
          const p = state.projects.find((x) => x.id === projectId); if (!p) return
          const prev = type === 'likert' ? p.survey.questions.findLast((x) => x.type === 'likert') : null
          if (prev) { q.scale = prev.scale; q.low = prev.low; q.high = prev.high }
          p.survey.questions.push(q); p.survey.draft = true; touchProject(p)
        })
        return q.id
      },
      /* 구글 설문처럼 문항을 복제 — 질문 내용·응답 형식·척도(점수 수, 양끝 이름)·선택지를 그대로 복사해 바로 뒤에 둔다.
       * 원래 문항이 후속 질문을 가지고 있으면 후속 질문 묶음 뒤에 둔다(후속 질문은 복제하지 않음) */
      dupQ(projectId, qid) {
        let newId = null
        set((state) => {
          const p = state.projects.find((x) => x.id === projectId); if (!p) return
          const s = p.survey, src = s.questions.find((x) => x.id === qid); if (!src) return
          const copy = { ...clone(src), id: uid('q') }
          const kids = src.parentId ? [] : s.questions.filter((x) => x.parentId === src.id)
          const after = kids.length ? kids[kids.length - 1] : src
          s.questions.splice(s.questions.indexOf(after) + 1, 0, copy)
          newId = copy.id
          s.draft = true; touchProject(p)
        })
        return newId
      },
      addFollow(projectId, parentId) {
        const q = question('choice', parentId)
        set((state) => {
          const p = state.projects.find((x) => x.id === projectId); if (!p) return
          const kids = p.survey.questions.filter((x) => x.parentId === parentId)
          const after = kids.length ? kids[kids.length - 1] : p.survey.questions.find((x) => x.id === parentId)
          p.survey.questions.splice(p.survey.questions.indexOf(after) + 1, 0, q)
          p.survey.draft = true; touchProject(p)
        })
        return q.id
      },
      moveQ(projectId, qid, dir) {
        set((state) => {
          const p = state.projects.find((x) => x.id === projectId); if (!p) return
          const s = p.survey, q = s.questions.find((x) => x.id === qid); if (!q) return
          const sibs = s.questions.filter((x) => (x.parentId || null) === (q.parentId || null))
          const i = sibs.indexOf(q), other = sibs[i + dir]; if (!other) return
          const a = s.questions.indexOf(q), b = s.questions.indexOf(other)
          ;[s.questions[a], s.questions[b]] = [s.questions[b], s.questions[a]]
          s.questions = ordered(s); s.draft = true; touchProject(p)
        })
      },
      deleteQ(projectId, qid) {
        let label = ''
        set((state) => {
          const p = state.projects.find((x) => x.id === projectId); if (!p) return
          const s = p.survey, q = s.questions.find((x) => x.id === qid); if (!q) return
          label = qLabel(s, q)
          const removed = s.questions.filter((x) => x.id === qid || x.parentId === qid)
          useUiStore.getState().setLastDeleted({ projectId, items: clone(removed), index: s.questions.indexOf(q) })
          s.questions = s.questions.filter((x) => !removed.includes(x))
          s.draft = true; touchProject(p)
        })
        useUiStore.getState().showToast(
          `${label} 문항을 삭제했습니다.`,
          '실행 취소',
          { onClick: () => get().undoDelete(projectId) },
        )
      },
      undoDelete(projectId) {
        const lastDeleted = useUiStore.getState().lastDeleted
        if (!lastDeleted || lastDeleted.projectId !== projectId) return
        set((state) => {
          const p = state.projects.find((x) => x.id === projectId); if (!p) return
          const s = p.survey
          s.questions.splice(lastDeleted.index, 0, ...lastDeleted.items)
          s.questions = ordered(s); s.draft = true; touchProject(p)
        })
        useUiStore.getState().setLastDeleted(null)
        useUiStore.getState().showToast('삭제를 취소했습니다.')
      },
      restoreVersion(projectId, version) {
        set((state) => {
          const p = state.projects.find((x) => x.id === projectId); if (!p) return
          const s = p.survey, h = s.history.find((x) => String(x.version) === String(version)); if (!h) return
          s.title = h.title; s.description = h.description; s.questions = clone(h.questions)
          s.draft = true; touchProject(p)
        })
      },

      /* ---------- 대상 집단 ---------- */
      addGroup(projectId) {
        const p = get().projects.find((x) => x.id === projectId)
        const g = makeGroup('새 대상 집단 ' + ((p?.groups.length || 0) + 1))
        set((state) => {
          const p = state.projects.find((x) => x.id === projectId); if (!p) return
          p.groups.push(g); p.activeGroupId = g.id; touchProject(p)
        })
        return g.id
      },
      dupGroup(projectId) {
        let newId = null
        set((state) => {
          const p = state.projects.find((x) => x.id === projectId); if (!p) return
          const src = p.groups.find((x) => x.id === p.activeGroupId) || p.groups[0]
          const g = { ...clone(src), id: uid('group'), name: src.name + ' (복사본)', cohort: null }
          newId = g.id
          p.groups.push(g); p.activeGroupId = g.id; touchProject(p)
        })
        useUiStore.getState().showToast('복사본을 만들었습니다. 조건을 바꾼 뒤 구성하세요.')
        return newId
      },
      delGroup(projectId, groupId) {
        set((state) => {
          const p = state.projects.find((x) => x.id === projectId); if (!p) return
          if (p.groups.length <= 1) return
          p.groups = p.groups.filter((x) => x.id !== groupId)
          p.activeGroupId = p.groups[0]?.id ?? null
          touchProject(p)
        })
      },
      buildCohort(projectId, groupId) {
        let result = { ok: true }
        set((state) => {
          const p = state.projects.find((x) => x.id === projectId); if (!p) return
          const g = p.groups.find((x) => x.id === groupId); if (!g) return
          const err = groupError(g)
          if (err) { result = { ok: false, error: err }; return }
          libBuildCohort(g); touchProject(p)
        })
        return result
      },
      applyTargetFilter(projectId, groupId, filters) {
        set((state) => {
          const p = state.projects.find((x) => x.id === projectId); if (!p) return
          const g = p.groups.find((x) => x.id === groupId); if (!g) return
          g.filters = filters; touchProject(p)
        })
      },
      removeTargetFilter(projectId, groupId, key) {
        set((state) => {
          const p = state.projects.find((x) => x.id === projectId); if (!p) return
          const g = p.groups.find((x) => x.id === groupId); if (!g) return
          delete g.filters[key]; touchProject(p)
        })
      },
      renameGroup(projectId, groupId, name) {
        set((state) => {
          const p = state.projects.find((x) => x.id === projectId); if (!p) return
          const g = p.groups.find((x) => x.id === groupId); if (!g) return
          g.name = name; touchProject(p)
        })
      },
      setGroupCount(projectId, groupId, count) {
        set((state) => {
          const p = state.projects.find((x) => x.id === projectId); if (!p) return
          const g = p.groups.find((x) => x.id === groupId); if (!g) return
          g.count = count; touchProject(p)
        })
      },
      selectGroup(projectId, groupId) {
        set((state) => {
          const p = state.projects.find((x) => x.id === projectId); if (!p) return
          p.activeGroupId = groupId; touchProject(p)
        })
      },

      /* ---------- 응답 모델 ---------- */
      setModel(projectId, modelId) {
        set((state) => {
          const p = state.projects.find((x) => x.id === projectId); if (!p) return
          p.model = { id: modelId }; touchProject(p)
        })
      },
      setConnectedModel(projectId, connectionId, modelId) {
        set((state) => {
          const p = state.projects.find((x) => x.id === projectId); if (!p) return
          p.model = connectionId && modelId ? { connectionId, modelId } : null
          touchProject(p)
        })
      },

      /* ---------- 시뮬레이션 ---------- */
      startRun(projectId, { failNext } = {}) {
        let result
        set((state) => {
          const p = state.projects.find((x) => x.id === projectId); if (!p) return
          if (p.runs.some((x) => x.status === 'running')) { result = { ok: false, error: '진행 중인 실행이 끝난 뒤 다시 실행하세요.' }; return }
          const g = p.groups.find((x) => x.id === p.activeGroupId) || p.groups[0]
          let r
          try { r = createRun(p, g) } catch (e) { result = { ok: false, error: e.message }; return }
          r.failAt = failNext ? 60 : null
          r.model = p.model?.id ?? null
          useUiStore.getState().setFailNext(false)
          p.runs.unshift(r); touchProject(p)
          result = { ok: true, runId: r.id, runNumber: r.number }
        })
        return result
      },
      retryRun(projectId, runId) {
        set((state) => {
          const p = state.projects.find((x) => x.id === projectId); if (!p) return
          const r = p.runs.find((x) => x.id === runId); if (!r) return
          r.status = 'running'; r.failNote = ''
        })
      },
      /* 진행률 타이머 콜백(useSimulationJob)이 450ms마다 호출. 사용자 액션이 아니라 touch()는 호출하지 않음 */
      tick(projectId, runId) {
        let result = null
        set((state) => {
          const p = state.projects.find((x) => x.id === projectId)
          const r = p?.runs.find((x) => x.id === runId)
          if (!r) { result = null; return }
          r.progress = Math.min(100, r.progress + 10)
          if (r.failAt && r.progress >= r.failAt) {
            r.status = 'failed'
            r.failNote = `${r.progress}%에서 멈췄습니다 · 성공 응답 ${Math.round(r.responses.length * r.progress / 100)}개`
            r.failAt = null
            result = { status: 'failed', number: r.number }
            return
          }
          if (r.progress >= 100) {
            r.status = 'completed'; r.failNote = ''
            result = { status: 'completed', number: r.number }
            return
          }
          result = { status: 'running', number: r.number }
        })
        return result
      },

      /* ---------- 인터뷰 ---------- */
      ask(projectId, runId, personaId, questionId, text) {
        text = String(text || '').trim(); if (!text) return
        set((state) => {
          const p = state.projects.find((x) => x.id === projectId); if (!p) return
          const r = p.runs.find((x) => x.id === runId); if (!r) return
          const person = r.people.find((x) => x.id === personaId); if (!person) return
          const q = r.survey.questions.find((x) => x.id === questionId); if (!q) return
          const a = answerOf(r, person.id, q.id)
          if (!a) { useUiStore.getState().showToast('이 문항에는 저장된 응답이 없어 시연 인터뷰를 시작할 수 없습니다.'); return }
          const said = q.type === 'text' ? `"${(a?.text || '').slice(0, 40)}…"라고 답했습니다`
            : q.type === 'likert' ? `${qLabel(r.survey, q)}에 ${a.answer + 1}점(${q.scale}점 척도, ${a.answer + 1 > (q.scale + 1) / 2 ? '동의하는 쪽' : a.answer + 1 < (q.scale + 1) / 2 ? '동의하지 않는 쪽' : '중간'})으로 답했습니다`
            : `${qLabel(r.survey, q)}에서 "${answerText(q, a.answer)}"를 골랐습니다`
          const answer = `${said}. 저는 ${attrValue(person, 'age')} ${attrValue(person, 'sex')}이고 ${person.attributes.occupation}로 일하고 있어요. 개방성은 ${attrValue(person, 'openness')}, 성실성은 ${attrValue(person, 'conscientiousness')}인 편이라 그 점이 답에 영향을 줬습니다.`
          const key = r.id + '::' + person.id
          p.chats[key] = p.chats[key] || []
          p.chats[key].push({ qid: q.id, question: text, answer, created: new Date().toISOString() })
          touchProject(p)
        })
      },
    }))

export const useProjectStore = create(SERVER_STORAGE ? projectState : persist(projectState,
    {
      name: STORE_KEY,
      storage,
      version: 0,
      partialize: (state) => ({ projects: state.projects }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        projects: migrateProjects(persistedState?.projects),
      }),
      /* merge()가 만든 예시 데이터·failed 전환은 다음 set() 전까지 메모리에만 있다.
         불러온 직후 한 번 그대로 다시 써서, 새로고침해도 같은 프로젝트가 열리게 한다 */
      onRehydrateStorage: () => (state) => {
        if (state) storage.setItem(STORE_KEY, { state: { projects: state.projects } })
      },
    },
))

let demoCache = {}
let sessionUserId = ''
function withDemo(project) {
  const local = demoCache[project.id] || { runs: [], chats: {} }
  const merged = { ...project, survey: { version: 0, history: [], draft: true, ...project.survey }, ...local }
  return migrateProjects([merged])[0]
}

let projectSync = null
export function initializeSession(userId) {
  if (!SERVER_STORAGE || sessionUserId === userId) return
  if (sessionUserId) throw Error('계정을 바꾸려면 페이지를 새로고침하세요.')
  sessionUserId = userId
  try { demoCache = JSON.parse(localStorage.getItem(`${DEMO_KEY}:${userId}`) || '{}') } catch { /* optional demo results */ }
  projectSync = createProjectSync({
  api: projectApi,
  storage: {
    getItem: (key) => sessionStorage.getItem(`${key}:${userId}`),
    setItem: (key, value) => sessionStorage.setItem(`${key}:${userId}`, value),
  },
  onHydrate(projects) { useProjectStore.setState({ projects: projects.map(withDemo) }) },
  onReplace(remote) {
    useProjectStore.setState((state) => ({ projects: state.projects.map((p) => p.id === remote.id
      ? { ...remote, runs: p.runs, chats: p.chats } : p) }))
  },
  onStatus(sync) { useProjectStore.setState({ sync }) },
  })
}

const unsubscribe = SERVER_STORAGE ? useProjectStore.subscribe((state, previous) => {
  if (!projectSync || state.projects === previous.projects) return
  // Older browser demos and template chats stay local. Server responses always come from the DB.
  demoCache = Object.fromEntries(state.projects.map((p) => [p.id, { runs: p.runs.filter((r) => !r._server), chats: p.chats }]))
  try {
    localStorage.setItem(`${DEMO_KEY}:${sessionUserId}`, JSON.stringify(demoCache))
    useUiStore.getState().setSaveOk(true)
  } catch { useUiStore.getState().setSaveOk(false) }
  projectSync.track(state.projects)
}) : null

function guardUnload(event) {
  if (!projectSync?.hasPending()) return
  void projectSync.flushAll()
  event.preventDefault()
  event.returnValue = ''
}
if (SERVER_STORAGE && typeof window !== 'undefined') window.addEventListener('beforeunload', guardUnload)
if (import.meta.hot) import.meta.hot.dispose(() => {
  unsubscribe?.()
  projectSync?.dispose()
  window.removeEventListener('beforeunload', guardUnload)
})

/* 화면에서 자주 쓰는 "현재 프로젝트 찾기" 셀렉터 */
export function useProject(projectId) {
  return useProjectStore((state) => state.projects.find((p) => p.id === projectId))
}
