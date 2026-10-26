import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createStore } from 'zustand/vanilla'
import { immer } from 'zustand/middleware/immer'
import { createServerRunActions, mergeServerRun } from '../src/store/serverRuns.js'
import { projectDocument } from '../src/lib/projectApi.js'
import { canRetryRun, hasRunResults, isRunActive } from '../src/lib/runStatus.js'

const survey = { title: 'DDP', description: '', questions: [{ id: 'q1', type: 'likert', text: '유지?', scale: 7 }], version: 0, history: [], draft: true }
const row = (extra = {}) => ({ id: 'r1', projectId: 'p1', number: 1, status: 'queued', updated: '2026-10-23T00:00:00Z', survey, ...extra })
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r }); return { promise, resolve } }
let storage
beforeEach(() => {
  storage = new Map()
  vi.stubGlobal('sessionStorage', { getItem: (k) => storage.get(k), setItem: (k, v) => storage.set(k, v) })
})
afterEach(() => vi.unstubAllGlobals())

function setup(sync = { flush: async () => true, getBase: () => ({ revision: 4, activeGroupId: 'g1' }) }) {
  return createStore(immer((set, get) => ({ projects: [{ id: 'p1', survey: structuredClone(survey), runs: [] }], ...createServerRunActions(set, get, () => sync) })))
}

it('flushes pending edits before execution and coalesces repeated start clicks', async () => {
  const gate = deferred(), events = []
  let revision = 4
  const store = setup({ flush: async () => { events.push('saving'); await gate.promise; revision = 5; events.push('saved'); return true }, getBase: () => ({ revision, activeGroupId: 'g1' }) })
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
    if (options.method === 'POST') {
      events.push('started')
      expect(JSON.parse(options.body)).toMatchObject({ expectedRevision: 5, groupId: 'g1', failNext: true })
      return Response.json(row())
    }
    return Response.json({ runs: [row()], surveyState: { version: 0, history: [] } })
  }))
  const first = store.getState().startServerRun('p1', true)
  expect(store.getState().startServerRun('p1', true)).toBe(first)
  expect(fetch).not.toHaveBeenCalled()
  gate.resolve()
  expect(await first).toMatchObject({ ok: true, runId: 'r1' })
  expect(events).toEqual(['saving', 'saved', 'started'])
})

it('reuses the accepted request identity after a lost response and a fresh store', async () => {
  const bodies = []
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
    if (options.method === 'POST') {
      bodies.push(JSON.parse(options.body))
      if (bodies.length === 1) throw Error('lost response')
      return Response.json(row())
    }
    return Response.json({ runs: [row()], surveyState: { version: 0, history: [] } })
  }))
  expect(await setup().getState().startServerRun('p1')).toMatchObject({ ok: false })
  expect(await setup().getState().startServerRun('p1')).toMatchObject({ ok: true })
  expect(bodies[0]).toEqual(bodies[1])
  expect(bodies[0].requestId).toBeTruthy()
})

it('does not remove a newly created run or regress survey metadata when an earlier poll returns', async () => {
  const gate = deferred(), store = setup()
  vi.stubGlobal('fetch', vi.fn(() => gate.promise))
  const pending = store.getState().refreshRuns()
  store.setState((state) => {
    state.projects[0].runs.push(mergeServerRun(null, row()))
    state.projects[0].survey.version = 1
    state.projects[0].survey.history = [{ ...structuredClone(survey), version: 1 }]
  })
  gate.resolve(Response.json({ runs: [], surveyState: { version: 0, history: [] } }))
  await pending
  expect(store.getState().projects[0].runs).toHaveLength(1)
  expect(store.getState().projects[0].survey.version).toBe(1)
  expect(store.getState().projects[0].survey.draft).toBe(false)
})

it('keeps a loaded immutable result across unchanged polls and ignores older status', () => {
  const completed = mergeServerRun(null, row({ status: 'completed', updated: '2026-10-23T01:00:00Z', responses: [{ answer: 6 }], people: [{ id: 'P1' }] }), true)
  const polled = mergeServerRun(completed, row({ status: 'completed', updated: completed.updated }))
  expect(polled._loaded).toBe(true)
  expect(polled.responses).toEqual(completed.responses)
  expect(mergeServerRun(completed, row())).toBe(completed)
  const retried = mergeServerRun(completed, row({ status: 'running', updated: '2026-10-23T02:00:00Z' }))
  expect(retried._loaded).toBe(false)
})

it('excludes server-owned execution metadata from autosave and exposes partial results', () => {
  const project = { id: 'p1', name: '', description: '', survey, groups: [], activeGroupId: '', model: null }
  const changed = { ...project, survey: { ...survey, version: 3, draft: false, history: [survey] }, runs: [row()] }
  expect(projectDocument(changed)).toEqual(projectDocument(project))
  expect(hasRunResults({ status: 'partial_failed', responseCount: 9 })).toBe(true)
  expect(hasRunResults({ status: 'cancelled', responseCount: 0 })).toBe(false)
  expect(canRetryRun({ status: 'partial_failed' })).toBe(true)
  expect(isRunActive({ status: 'queued' })).toBe(true)
})
