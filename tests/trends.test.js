import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { completedTrendRuns, readTrendChoice, saveTrendChoice, selectedTrendRun } from '../src/lib/trends.js'
import { setSessionIdentity } from '../src/lib/projectApi.js'
import { trendKey, useTrendStore } from '../src/store/useTrendStore.js'

beforeEach(() => {
  const storage = new Map()
  vi.stubGlobal('localStorage', { getItem: (k) => storage.get(k), setItem: (k, v) => storage.set(k, v) })
  setSessionIdentity('a')
  useTrendStore.setState({ summaries: {} })
})
afterEach(() => { vi.unstubAllGlobals(); setSessionIdentity('') })

it('selects the most recently completed run while excluding active and failed runs', () => {
  const runs = completedTrendRuns([
    { id: 'one', number: 1, status: 'completed', finished: '2026-11-03T10:00:00Z' },
    { id: 'two', number: 2, status: 'completed', finished: '2026-11-03T09:00:00Z' },
    { id: 'three', number: 3, status: 'running' }, { id: 'four', status: 'partial_failed' },
  ])
  expect(selectedTrendRun(runs, 'latest').id).toBe('one')
  expect(selectedTrendRun(runs, 'two').id).toBe('two')
  expect(selectedTrendRun(runs, 'stale').id).toBe('one')
  expect(selectedTrendRun([], 'latest')).toBeNull()
})

it('restores the choice per project and signed-in account', () => {
  saveTrendChoice('p1', 'run-one')
  expect(readTrendChoice('p1')).toBe('run-one')
  expect(readTrendChoice('p2')).toBe('latest')
  setSessionIdentity('b')
  expect(readTrendChoice('p1')).toBe('latest')
  setSessionIdentity('a')
  expect(readTrendChoice('p1')).toBe('run-one')
})

it('coalesces generation requests and restores cached summaries without a second POST', async () => {
  let server = { runId: 'r1', status: 'missing' }
  const fetch = vi.fn(async (_url, options) => {
    if (options.method === 'POST') server = { runId: 'r1', status: 'queued' }
    return Response.json(server)
  })
  vi.stubGlobal('fetch', fetch)
  await Promise.all([useTrendStore.getState().load('r1'), useTrendStore.getState().load('r1')])
  expect(fetch.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1)
  server = { runId: 'r1', status: 'completed', content: { headline: '저장된 요약' } }
  useTrendStore.setState({ summaries: {} })
  await useTrendStore.getState().load('r1')
  await useTrendStore.getState().load('r1')
  expect(useTrendStore.getState().summaries[trendKey('r1')].data.content.headline).toBe('저장된 요약')
  expect(fetch).toHaveBeenCalledTimes(3)
})

it('keeps late responses isolated when selecting another run and never retries failed models automatically', async () => {
  let finish
  vi.stubGlobal('fetch', vi.fn(async (url) => url.includes('r1/') ? new Promise((resolve) => { finish = resolve }) : Response.json({ runId: 'r2', status: 'failed', error: '키 확인' })))
  const first = useTrendStore.getState().load('r1')
  await useTrendStore.getState().load('r2')
  finish(Response.json({ runId: 'r1', status: 'completed', content: { headline: '이전 회차' } }))
  await first
  expect(useTrendStore.getState().summaries[trendKey('r2')].data.status).toBe('failed')
  expect(fetch.mock.calls.every(([, options]) => options.method !== 'POST')).toBe(true)
})
