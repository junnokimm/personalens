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

const STORE_KEY = 'personascope-proto-v4'

/* 원본 touch(): 프로젝트를 고치는 거의 모든 액션 끝에서 updated를 갱신합니다 */
function touchProject(project) {
  project.updated = new Date().toISOString()
}

/* 원본 load(): 저장된 데이터가 있으면 그대로, 없으면 예시 프로젝트. running 실행은 failed로 */
function migrateProjects(persistedProjects) {
  const projects = persistedProjects?.length ? persistedProjects : [sample()]
  return projects.map((p) => ({
    ...p,
    runs: p.runs.map((r) => (r.status === 'running' ? { ...r, status: 'failed', failNote: '페이지를 새로 열어 실행이 멈췄습니다.' } : r)),
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

export const useProjectStore = create(
  persist(
    immer((set, get) => ({
      projects: [],

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
        set((state) => { state.projects = [sample()] })
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
      addQ(projectId, type) {
        const q = question(type)
        if (type === 'likert') { q.low = '전혀 그렇지 않다'; q.high = '매우 그렇다' }
        set((state) => {
          const p = state.projects.find((x) => x.id === projectId); if (!p) return
          p.survey.questions.push(q); p.survey.draft = true; touchProject(p)
        })
        return q.id
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
    })),
    {
      name: STORE_KEY,
      storage,
      version: 0,
      partialize: (state) => ({ projects: state.projects }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        projects: migrateProjects(persistedState?.projects),
      }),
    },
  ),
)
