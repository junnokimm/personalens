import { getSessionIdentity, request, stableJson, surveyContent } from '../lib/projectApi.js'
import { useUiStore } from './useUiStore.js'

const REQUESTS_KEY = 'personalens-run-requests-v1'
const runApi = {
  list: (id) => request(`/projects/${encodeURIComponent(id)}/runs`),
  result: (id) => request(`/runs/${encodeURIComponent(id)}/result`),
  start: (id, body) => request(`/projects/${encodeURIComponent(id)}/runs`, { method: 'POST', body: JSON.stringify(body) }),
  action: (id, action) => request(`/runs/${encodeURIComponent(id)}/${action}`, { method: 'POST' }),
}

export function mergeServerRun(previous, incoming, full = false) {
  if (previous?._server && new Date(previous.updated) > new Date(incoming.updated)) return previous
  const keepResult = previous?._loaded && previous.updated === incoming.updated
  return { ...incoming, _server: true, _loaded: full || !!keepResult,
    people: full ? incoming.people : keepResult ? previous.people : [],
    responses: full ? incoming.responses : keepResult ? previous.responses : [] }
}

export function createServerRunActions(set, get, getSync) {
  let refreshing = null
  const loading = new Map(), starting = new Map()
  let requests = {}
  let requestOwner = null
  function restoreRequests() {
    const identity = getSessionIdentity()
    if (identity === requestOwner) return
    requestOwner = identity
    requests = {}
    try { requests = JSON.parse(sessionStorage.getItem(`${REQUESTS_KEY}:${identity}`) || '{}') || {} } catch { /* optional retry recovery */ }
  }
  function remember() {
    try { sessionStorage.setItem(`${REQUESTS_KEY}:${requestOwner}`, JSON.stringify(requests)) } catch { /* server list still recovers accepted runs */ }
  }
  function upsert(projectId, incoming, full = false) {
    set((state) => {
      const project = state.projects.find((p) => p.id === projectId)
      if (!project || incoming.projectId !== projectId) return
      const index = project.runs.findIndex((r) => r.id === incoming.id)
      const merged = mergeServerRun(project.runs[index], incoming, full)
      if (index >= 0) project.runs[index] = merged
      else project.runs.unshift(merged)
    })
  }
  return {
    runsLoaded: false, runsError: '', resultErrors: {}, startingRuns: {},
    refreshRuns() {
      if (refreshing) return refreshing
      refreshing = (async () => {
        try {
          const targets = get().projects.filter((p) => getSync().getBase(p.id))
          const fetched = await Promise.all(targets.map(async (p) => ({ id: p.id, data: await runApi.list(p.id) })))
          set((state) => {
            for (const { id, data } of fetched) {
              const p = state.projects.find((p) => p.id === id)
              if (!p) continue
              const previous = new Map(p.runs.map((r) => [r.id, r]))
              const received = new Set(data.runs.map((r) => r.id))
              // Runs are append-only: a poll started before POST must not remove its new run.
              p.runs = [...data.runs.map((r) => mergeServerRun(previous.get(r.id), r)), ...p.runs.filter((r) => r._server && !received.has(r.id))]
                .sort((a, b) => b.number - a.number)
                .concat(p.runs.filter((r) => !r._server))
              if (data.surveyState.version >= (p.survey.version || 0)) {
                p.survey.version = data.surveyState.version
                p.survey.history = data.surveyState.history
              }
              const latest = p.survey.history.at(-1)
              p.survey.draft = !latest || stableJson(surveyContent(p.survey)) !== stableJson({ title: latest.title, description: latest.description, questions: latest.questions })
            }
            state.runsLoaded = true
            state.runsError = ''
          })
          return true
        } catch (error) {
          set({ runsError: error.message })
          return false
        }
      })().finally(() => { refreshing = null })
      return refreshing
    },
    loadRunResult(projectId, runId) {
      if (loading.has(runId)) return loading.get(runId)
      set((state) => { delete state.resultErrors[runId] })
      const promise = runApi.result(runId).then((run) => upsert(projectId, run, true)).catch((error) => {
        set((state) => { state.resultErrors[runId] = error.message })
      }).finally(() => loading.delete(runId))
      loading.set(runId, promise)
      return promise
    },
    startServerRun(projectId, failNext = false) {
      restoreRequests()
      if (starting.has(projectId)) return starting.get(projectId)
      set((state) => { state.startingRuns[projectId] = true })
      const promise = (async () => {
        try {
          if (!await getSync().flush(projectId)) throw Error('설계 저장을 완료한 뒤 실행하세요. 상단 저장 상태를 확인하세요.')
          const base = getSync().getBase(projectId)
          if (!base) throw Error('프로젝트를 먼저 저장하세요.')
          requests[projectId] ||= { expectedRevision: base.revision, requestId: crypto.randomUUID(), groupId: base.activeGroupId, failNext }
          remember()
          const run = await runApi.start(projectId, requests[projectId])
          delete requests[projectId]
          remember()
          upsert(projectId, run)
          useUiStore.getState().setFailNext(false)
          useUiStore.getState().showToast(`실행 #${run.number}을 서버에 접수했습니다. 브라우저를 닫아도 계속됩니다.`)
          await get().refreshRuns()
          return { ok: true, runId: run.id, runNumber: run.number }
        } catch (error) {
          if (error.status >= 400 && error.status < 500) { delete requests[projectId]; remember() }
          useUiStore.getState().showToast(error.message)
          return { ok: false, error: error.message }
        } finally {
          set((state) => { delete state.startingRuns[projectId] })
        }
      })().finally(() => starting.delete(projectId))
      starting.set(projectId, promise)
      return promise
    },
    async serverRunAction(projectId, runId, action) {
      try {
        upsert(projectId, await runApi.action(runId, action))
        await get().refreshRuns()
      } catch (error) { useUiStore.getState().showToast(error.message) }
    },
  }
}
