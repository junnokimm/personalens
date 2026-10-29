import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useInterviewStore } from '../src/store/useInterviewStore.js'
import { getSessionIdentity } from '../src/lib/projectApi.js'

const row = (status = 'queued') => ({ id: 't1', requestId: 'request1', sequence: 1, status, updated: '2026-10-29T01:00:00Z', question: '이유?', qid: 'q1', usage: { attempts: 1 } })
let storage
beforeEach(() => {
  storage = new Map()
  vi.stubGlobal('sessionStorage', { getItem: (k) => storage.get(k), setItem: (k, v) => storage.set(k, v), removeItem: (k) => storage.delete(k) })
  useInterviewStore.setState({ threads: {} })
})
afterEach(() => vi.unstubAllGlobals())

it('retains accepted questions when an older list finishes late', async () => {
  let finish
  vi.stubGlobal('fetch', vi.fn((_url, options) => options.method === 'POST'
    ? Promise.resolve(Response.json(row(), { status: 202 }))
    : new Promise((resolve) => { finish = resolve })) )
  const loading = useInterviewStore.getState().load('r1', 'p1')
  expect(await useInterviewStore.getState().send('r1', 'p1', 'q1', '이유?')).toBe(true)
  finish(Response.json({ turns: [] }))
  await loading
  expect(useInterviewStore.getState().threads['r1::p1'].turns).toHaveLength(1)
  expect(await useInterviewStore.getState().send('r1', 'p1', 'q1', '중복')).toBe(false)
})

it('restores DB turns in a fresh store and clears an accepted lost-response request', async () => {
  const key = `personalens-interview:${getSessionIdentity()}:r1::p1`
  storage.set(key, JSON.stringify({ requestId: 'request1', questionId: 'q1', question: '이유?' }))
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ turns: [{ ...row('completed'), answer: '저장된 답변' }] })))
  await useInterviewStore.getState().load('r1', 'p1')
  expect(useInterviewStore.getState().threads['r1::p1'].turns[0].answer).toBe('저장된 답변')
  expect(storage.has(key)).toBe(false)
  expect(useInterviewStore.getState().threads['r2::p1']).toBeUndefined()
})

it('reuses the request ID after a network failure without discarding typed text', async () => {
  const calls = []
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
    calls.push(JSON.parse(options.body))
    if (calls.length === 1) throw Error('connection lost')
    return Response.json(row(), { status: 202 })
  }))
  expect(await useInterviewStore.getState().send('r1', 'p1', 'q1', '이유?')).toBe(false)
  expect(await useInterviewStore.getState().send('r1', 'p1', 'q1', '이유?')).toBe(true)
  expect(calls[0].requestId).toBe(calls[1].requestId)
})
