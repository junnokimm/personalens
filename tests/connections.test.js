import { afterEach, expect, it, vi } from 'vitest'
import { modelFlowState } from '../src/lib/models.js'
import { projectDocument, request, setSessionIdentity } from '../src/lib/projectApi.js'

afterEach(() => { vi.unstubAllGlobals(); setSessionIdentity('') })

it('shows unavailable connections and removed models as incomplete without changing the saved selection', () => {
  const selection = { connectionId: 'c1', modelId: 'Qwen/demo-8B' }
  const ready = { id: 'c1', enabled: true, status: 'ready', models: [{ id: selection.modelId }] }
  expect(modelFlowState(selection, false, [ready]).ready).toBe(true)
  expect(modelFlowState(selection, false, [{ ...ready, status: 'manual' }]).ready).toBe(true)
  for (const connections of [[], [{ ...ready, enabled: false }], [{ ...ready, status: 'error' }], [{ ...ready, models: [] }]]) {
    expect(modelFlowState(selection, false, connections).code).toBe('needs-connection')
  }
  expect(modelFlowState({ id: 'qwen' }, false, []).ready).toBe(false)
  expect(modelFlowState({ id: 'qwen' }, false).ready).toBe(true) // legacy local demo
})

it('serializes only the connection reference in project drafts', () => {
  const serialized = projectDocument({ id: 'p', name: 'n', description: '', survey: {}, groups: [], activeGroupId: 'g',
    model: { connectionId: 'c', modelId: 'm', apiKey: 'fake-secret', baseUrl: 'http://private-server' } })
  expect(serialized.model).toEqual({ connectionId: 'c', modelId: 'm' })
  expect(JSON.stringify(serialized)).not.toMatch(/fake-secret|private-server/)
})

it('binds browser requests to the signed-in identity while cookies stay HttpOnly', async () => {
  setSessionIdentity('user-a')
  const fetch = vi.fn(async () => Response.json({ ok: true }))
  vi.stubGlobal('fetch', fetch)
  await request('/connections', { method: 'POST', body: '{}' })
  expect(fetch.mock.calls[0][1]).toMatchObject({ credentials: 'same-origin', headers: { 'X-Persona-Request': '1', 'X-Persona-User': 'user-a' } })
})
