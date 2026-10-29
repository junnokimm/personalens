import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, projectDocument } from '../src/lib/projectApi.js'
import { createProjectSync, OUTBOX_KEY } from '../src/store/projectSync.js'
import { groupKey, groupStale } from '../src/lib/cohort.js'

const doc = () => ({ id: 'p1', name: '설문', description: '', survey: { title: '초안', questions: [] }, groups: [{ id: 'g1', count: null, filters: {} }], activeGroupId: 'g1', model: null })
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const instances = []
function setup(remote = [{ ...doc(), revision: 1 }], storage = new Map()) {
  let projects, status
  const api = {
    list: vi.fn(async () => ({ projects: structuredClone(remote) })),
    get: vi.fn(async () => structuredClone(remote[0])),
    save: vi.fn(async (op) => ({ ...op.document, revision: op.expectedRevision + 1, lastMutationId: op.mutationId })),
  }
  const sync = createProjectSync({ api,
    storage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    onHydrate: (value) => { projects = value }, onReplace: (value) => { projects = [value] }, onStatus: (value) => { status = value },
  })
  instances.push(sync)
  return { sync, api, storage, projects: () => projects, status: () => status }
}
afterEach(() => { instances.splice(0).forEach((sync) => sync.dispose()); vi.useRealTimers() })

describe('server project persistence', () => {
  it('hydrates a server cohort reference recovered from an unsaved outbox without copying profiles back into it', async () => {
    const storage = new Map()
    const draft = doc()
    draft.groups[0].cohort = { id: 'cohort-new' }
    storage.set(OUTBOX_KEY, JSON.stringify({ p1: { document: draft, revision: 1 } }))
    const { sync, api, projects } = setup([{ ...doc(), revision: 1 }], storage)
    api.getCohort = vi.fn(async () => ({ id: 'cohort-new', people: [{ id: 'P-001', attributes: { detailed_persona: '서버 원본' } }] }))
    await sync.load()
    expect(projects()[0].groups[0].cohort.people[0].attributes.detailed_persona).toBe('서버 원본')
    expect(JSON.parse(storage.get(OUTBOX_KEY)).p1.document.groups[0].cohort).toEqual({ id: 'cohort-new' })
    await sync.flush('p1')
    expect(api.save.mock.calls[0][0].document.groups[0].cohort).toEqual({ id: 'cohort-new' })
  })
  it('coalesces edits and preserves only the latest document', async () => {
    vi.useFakeTimers()
    const { sync, api, status } = setup()
    await sync.load()
    sync.track([{ ...doc(), name: 'A' }])
    sync.track([{ ...doc(), name: 'AB' }])
    expect(status().projects.p1.status).toBe('pending')
    await vi.advanceTimersByTimeAsync(500)
    expect(api.save).toHaveBeenCalledTimes(1)
    expect(api.save.mock.calls[0][0].document.name).toBe('AB')
    expect(sync.hasPending()).toBe(false)
  })

  it('serializes overlapping edits without replacing newer editor state on acknowledgement', async () => {
    const { sync, api, projects } = setup()
    await sync.load()
    const first = deferred()
    api.save.mockImplementationOnce(() => first.promise)
    sync.track([{ ...doc(), name: 'first' }])
    const saving = sync.flush('p1')
    await Promise.resolve()
    sync.track([{ ...doc(), name: 'second' }])
    sync.track([{ ...doc(), name: 'third' }])
    expect(api.save).toHaveBeenCalledTimes(1)
    first.resolve({ ...doc(), name: 'first', revision: 2 })
    await saving
    expect(api.save).toHaveBeenCalledTimes(2)
    expect(api.save.mock.calls[1][0].document.name).toBe('third')
    expect(api.save.mock.calls[1][0].expectedRevision).toBe(2)
    expect(projects()[0].name).toBe('설문') // hydrate callback is never used for save acknowledgements
  })

  it('retries an uncertain response with the same mutation ID and then saves newer edits', async () => {
    const { sync, api, status } = setup()
    await sync.load()
    api.save.mockRejectedValueOnce(new ApiError('offline', 0, 'NETWORK_ERROR'))
    sync.track([{ ...doc(), name: 'first' }])
    expect(await sync.flush('p1')).toBe(false)
    expect(status().projects.p1.status).toBe('error')
    sync.track([{ ...doc(), name: 'second' }])
    await sync.retry('p1')
    expect(api.save.mock.calls[0][0]).toEqual(api.save.mock.calls[1][0])
    expect(api.save.mock.calls[2][0].document.name).toBe('second')
    expect(sync.hasPending()).toBe(false)
  })

  it('restores unsaved drafts after reload including a project not created yet', async () => {
    const first = setup([])
    await first.sync.load()
    first.sync.track([doc()])
    first.sync.dispose()
    const second = setup([], first.storage)
    await second.sync.load()
    expect(second.projects()[0].groups[0].count).toBeNull()
    await second.sync.flush('p1')
    expect(second.api.save.mock.calls[0][0].expectedRevision).toBe(0)
  })

  it('recovers from a rejected model selection by saving the newly chosen model', async () => {
    const { sync, api } = setup()
    await sync.load()
    api.save.mockRejectedValueOnce(new ApiError('모델 목록에서 사라졌습니다', 422, 'MODEL_NOT_AVAILABLE'))
    sync.track([{ ...doc(), model: { connectionId: 'c1', modelId: 'removed' } }])
    expect(await sync.flush('p1')).toBe(false)
    sync.track([{ ...doc(), model: { connectionId: 'c1', modelId: 'available' } }])
    expect(await sync.flush('p1')).toBe(true)
    expect(api.save.mock.calls[1][0].document.model.modelId).toBe('available')
    expect(api.save.mock.calls[1][0].expectedRevision).toBe(1)
    expect(api.save.mock.calls[1][0].mutationId).not.toBe(api.save.mock.calls[0][0].mutationId)
  })

  it('recognizes a committed request after reload even when its response was lost', async () => {
    const first = setup()
    await first.sync.load()
    first.api.save.mockRejectedValueOnce(new ApiError('offline', 0))
    first.sync.track([{ ...doc(), name: 'saved' }])
    await first.sync.flush('p1')
    const op = first.api.save.mock.calls[0][0]
    first.sync.track([{ ...doc(), name: 'later edit' }])
    const second = setup([{ ...op.document, revision: 2, lastMutationId: op.mutationId }], first.storage)
    await second.sync.load()
    await second.sync.flush('p1')
    expect(second.api.save.mock.calls[0][0].expectedRevision).toBe(2)
    expect(second.api.save.mock.calls[0][0].document.name).toBe('later edit')
  })

  it('preserves a conflicting draft and requires explicit server reload', async () => {
    const { sync, api, storage, status, projects } = setup()
    await sync.load()
    api.save.mockRejectedValueOnce(new ApiError('conflict', 409, 'REVISION_CONFLICT'))
    sync.track([{ ...doc(), name: 'local edit' }])
    await sync.flush('p1')
    sync.track([{ ...doc(), name: 'more local edits' }])
    expect(await sync.retry('p1')).toBe(false)
    expect(status().projects.p1.status).toBe('conflict')
    expect(JSON.parse(storage.get(OUTBOX_KEY)).p1.document.name).toBe('more local edits')
    api.get.mockResolvedValueOnce({ ...doc(), name: 'remote edit', revision: 3 })
    await sync.reloadProject('p1')
    expect(projects()[0].name).toBe('remote edit')
    expect(sync.hasPending()).toBe(false)
  })

  it('does not replace server data with demo data when loading fails', async () => {
    const { sync, api, projects } = setup()
    api.list.mockRejectedValueOnce(new Error('offline'))
    await expect(sync.load()).rejects.toThrow('offline')
    expect(projects()).toBeUndefined()
    expect(sync.hasPending()).toBe(false)
    await sync.load()
    expect(projects()[0].id).toBe('p1')
  })

  it('loads once when React StrictMode requests hydration twice', async () => {
    const { sync, api } = setup()
    await Promise.all([sync.load(), sync.load()])
    expect(api.list).toHaveBeenCalledTimes(1)
  })

  it('never sends keys, demo results or UI state', () => {
    const sent = projectDocument({ ...doc(), apiKeys: { p1: 'secret' }, runs: [{ id: 'run' }], chats: {}, updated: 'now' })
    expect(sent).toEqual(doc())
    expect(JSON.stringify(sent)).not.toContain('secret')
  })

  it('JSONB key ordering does not make an unchanged cohort stale', () => {
    const group = { count: 10, filters: { region: ['서울'], age: ['20대'] } }
    group.cohort = { builtFrom: groupKey(group) }
    group.filters = { age: ['20대'], region: ['서울'] }
    expect(groupStale(group)).toBe(false)
    group.filters.region = ['경기']
    expect(groupStale(group)).toBe(true)
  })
})
