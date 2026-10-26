import { afterEach, beforeEach, expect, it, vi } from 'vitest'

let database
beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('VITE_STORAGE_MODE', 'server')
  localStorage.clear()
  const drafts = new Map()
  vi.stubGlobal('sessionStorage', { getItem: (key) => drafts.get(key), setItem: (key, value) => drafts.set(key, value) })
  database = new Map()
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
    if (_url.endsWith('/runs')) return Response.json({ runs: [], surveyState: { version: 0, history: [] } })
    if (!options.method) return Response.json({ projects: [...database.values()] })
    const body = JSON.parse(options.body)
    const row = { ...body.document, revision: body.expectedRevision + 1, lastMutationId: body.mutationId, updated: new Date().toISOString() }
    database.set(row.id, row)
    return Response.json(row, { status: options.method === 'POST' ? 201 : 200 })
  }))
})
afterEach(() => { vi.unstubAllGlobals(); vi.stubEnv('VITE_STORAGE_MODE', 'local') })

it('default server store loads before editing and restores the existing editor data shape after a fresh import', async () => {
  const { useProjectStore: first, initializeSession } = await import('../src/store/useProjectStore.js')
  initializeSession('test-user')
  expect(first.getState().dataStatus).toBe('loading')
  expect(first.getState().projects).toEqual([])
  await first.getState().loadProjects()
  expect(first.getState().dataStatus).toBe('ready')
  expect(first.getState().projects).toEqual([]) // no implicit demo in an empty DB

  const id = first.getState().newProject('프로젝트', '설명')
  first.getState().editS(id, 'title', '설문 제목')
  const qid = first.getState().addQ(id, 'likert')
  first.getState().editQ(id, qid, 'scale', 7)
  first.getState().editQ(id, qid, 'low', '매우 반대')
  first.getState().editQ(id, qid, 'text', '첫 문항')
  first.getState().dupQ(id, qid)
  const gid = first.getState().projects[0].activeGroupId
  first.getState().renameGroup(id, gid, '이름 변경')
  first.getState().setGroupCount(id, gid, null)
  first.getState().applyTargetFilter(id, gid, { region: ['서울'], age: ['20대'] })
  const secondGroupId = first.getState().addGroup(id)
  first.getState().setModel(id, 'gpt')
  const { useUiStore } = await import('../src/store/useUiStore.js')
  useUiStore.getState().setApiKey(id, 'secret-not-saved')
  await first.getState().flushSaves()
  expect(JSON.stringify([...database.values()])).not.toContain('secret-not-saved')

  vi.resetModules()
  const { useProjectStore: reloaded, initializeSession: restore } = await import('../src/store/useProjectStore.js')
  restore('test-user')
  await reloaded.getState().loadProjects()
  const project = reloaded.getState().projects[0]
  expect(project.survey.title).toBe('설문 제목')
  expect(project.survey.questions.map((q) => [q.scale, q.low, q.text])).toEqual([[7, '매우 반대', '첫 문항'], [7, '매우 반대', '첫 문항']])
  expect(project.groups[0]).toMatchObject({ name: '이름 변경', count: null, filters: { region: ['서울'], age: ['20대'] } })
  expect(project.activeGroupId).toBe(secondGroupId)
  expect(project.model).toEqual({ id: 'gpt' })
  expect(project.runs).toEqual([])

  reloaded.getState().resetDemo()
  expect(reloaded.getState().projects[0].survey).toMatchObject({ version: 0, history: [], draft: true })
  await reloaded.getState().flushSaves()
  expect(database.has(id)).toBe(true)
  expect(database.size).toBe(2) // adding a demo never erases a real project
})

it('restores an unsaved new project with safe survey metadata before its first server version exists', async () => {
  const { OUTBOX_KEY } = await import('../src/store/projectSync.js')
  const document = { id: 'offline-project', name: '미저장 초안', description: '', survey: { title: '', description: '', questions: [] }, groups: [{ id: 'g1', name: '기본 집단', count: null, filters: {}, cohort: null }], activeGroupId: 'g1', model: null }
  sessionStorage.setItem(`${OUTBOX_KEY}:test-user`, JSON.stringify({ [document.id]: { document, revision: 0 } }))
  const { useProjectStore: store, initializeSession } = await import('../src/store/useProjectStore.js')
  initializeSession('test-user')
  await store.getState().loadProjects()
  expect(store.getState().projects[0].survey).toMatchObject({ version: 0, history: [], draft: true })
  await store.getState().flushSaves()
  expect(database.has(document.id)).toBe(true)
})

it('restores connection + model IDs without persisting connection secrets', async () => {
  const { useProjectStore: first, initializeSession } = await import('../src/store/useProjectStore.js')
  initializeSession('owner')
  await first.getState().loadProjects()
  const id = first.getState().newProject('연결 선택', '')
  first.getState().setConnectedModel(id, 'conn-openai', 'gpt-demo-small')
  await first.getState().flushSaves()
  first.getState().setConnectedModel(id, 'conn-anthropic', 'claude-demo-sonnet')
  await first.getState().flushSaves()
  vi.resetModules()
  const { useProjectStore: restored, initializeSession: init } = await import('../src/store/useProjectStore.js')
  init('owner')
  await restored.getState().loadProjects()
  expect(restored.getState().projects[0].model).toEqual({ connectionId: 'conn-anthropic', modelId: 'claude-demo-sonnet' })
  expect(() => init('another-user')).toThrow('새로고침')
})

it('never replays another account’s unsaved outbox into the signed-in account', async () => {
  const { OUTBOX_KEY } = await import('../src/store/projectSync.js')
  const document = { id: 'private-draft', name: '비공개 초안', survey: { title: '', questions: [] }, groups: [], model: null }
  sessionStorage.setItem(`${OUTBOX_KEY}:someone-else`, JSON.stringify({ [document.id]: { document, revision: 0 } }))
  const { useProjectStore: store, initializeSession } = await import('../src/store/useProjectStore.js')
  initializeSession('current-user')
  await store.getState().loadProjects()
  await store.getState().flushSaves()
  expect(store.getState().projects).toEqual([])
  expect(database.size).toBe(0)
})
