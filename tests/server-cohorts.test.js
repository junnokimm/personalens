import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { produce } from 'immer'
import { createServerCohortActions } from '../src/store/serverCohorts.js'
import { projectDocument, request } from '../src/lib/projectApi.js'

vi.mock('../src/lib/projectApi.js', async (original) => ({
  ...await original(), request: vi.fn(), getSessionIdentity: () => 'user-1',
}))
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
let storage
beforeEach(() => {
  vi.clearAllMocks()
  storage = new Map()
  vi.stubGlobal('sessionStorage', { getItem: (k) => storage.get(k), setItem: (k, v) => storage.set(k, v), removeItem: (k) => storage.delete(k) })
})
afterEach(() => vi.unstubAllGlobals())
const cohort = { id: 'cohort-1', people: [{ id: 'P-001', sourceRecordId: 'original-uuid', attributes: { age: '30대', detailed_persona: '원본 서술' } }], source: { kind: 'parquet' } }
function setup() {
  let state = { projects: [{ id: 'p1', name: '원본', survey: {}, groups: [{ id: 'g1', count: 10, filters: { age: ['30대'] }, cohort: null }] }], buildingCohorts: {} }
  const sync = { flush: vi.fn(async () => true), getBase: () => ({ ...state.projects[0], revision: 1 }) }
  const set = (fn) => { state = produce(state, fn) }
  const get = () => state
  const actions = createServerCohortActions(set, get, () => sync)
  return { actions, get, set, sync }
}

it('saves inputs before extraction, attaches only an immutable reference, then waits for persistence', async () => {
  const { actions, get, sync } = setup()
  request.mockResolvedValue(cohort)
  expect(await actions.buildServerCohort('p1', 'g1', 'dataset-1')).toEqual({ ok: true })
  expect(sync.flush).toHaveBeenCalledTimes(2)
  expect(get().projects[0].groups[0].cohort.people[0].sourceRecordId).toBe('original-uuid')
  expect(projectDocument(get().projects[0]).groups[0].cohort).toEqual({ id: 'cohort-1' })
  expect(storage.size).toBe(0)
})

it('ignores a delayed cohort when the user changed the target filters', async () => {
  const { actions, get, set } = setup()
  const pending = deferred()
  request.mockReturnValue(pending.promise)
  const result = actions.buildServerCohort('p1', 'g1', 'dataset-1')
  await Promise.resolve()
  set((s) => { s.projects[0].groups[0].filters.age = ['40대'] })
  pending.resolve(cohort)
  expect((await result).ok).toBe(false)
  expect(get().projects[0].groups[0].cohort).toBeNull()
})

it('coalesces duplicate clicks and retries an uncertain network response with the same request ID', async () => {
  const { actions } = setup()
  const pending = deferred()
  request.mockReturnValueOnce(pending.promise)
  const first = actions.buildServerCohort('p1', 'g1', 'dataset-1')
  expect(actions.buildServerCohort('p1', 'g1', 'dataset-1')).toBe(first)
  await Promise.resolve()
  pending.reject(Object.assign(Error('offline'), { status: 0 }))
  expect((await first).ok).toBe(false)
  request.mockResolvedValueOnce(cohort)
  expect((await actions.buildServerCohort('p1', 'g1', 'dataset-1')).ok).toBe(true)
  expect(JSON.parse(request.mock.calls[0][1].body)).toEqual(JSON.parse(request.mock.calls[1][1].body))
})

it('reports a persistence failure even when extraction succeeded', async () => {
  const { actions, sync } = setup()
  sync.flush.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
  request.mockResolvedValue(cohort)
  const result = await actions.buildServerCohort('p1', 'g1', 'dataset-1')
  expect(result.ok).toBe(false)
  expect(result.error).toContain('저장')
})
