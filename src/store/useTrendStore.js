import { useEffect } from 'react'
import { create } from 'zustand'
import { getSessionIdentity, request } from '../lib/projectApi.js'

export const trendKey = (runId) => `${getSessionIdentity()}::${runId}`
const route = (runId) => `/runs/${encodeURIComponent(runId)}/trend`
const EMPTY = { data: null, loading: false, error: '' }
const flights = new Map()

export const useTrendStore = create((set, get) => {
  function update(key, patch) {
    set((s) => ({ summaries: { ...s.summaries, [key]: { ...EMPTY, ...s.summaries[key], ...patch } } }))
  }
  function load(runId, retry = false) {
    const key = trendKey(runId)
    if (flights.has(key)) return flights.get(key)
    if (!retry && get().summaries[key]?.data?.status === 'completed') return Promise.resolve()
    update(key, { loading: true, error: '' })
    const owner = getSessionIdentity()
    const task = (async () => {
      try {
        let data = await request(route(runId) + (retry ? '/retry' : ''), retry ? { method: 'POST' } : {})
        if (getSessionIdentity() !== owner) return
        if (data.status === 'missing') data = await request(route(runId), { method: 'POST' })
        if (getSessionIdentity() === owner) update(key, { data, error: '' })
      } catch (error) {
        if (getSessionIdentity() === owner) update(key, { error: error.message })
      } finally {
        update(key, { loading: false })
        flights.delete(key)
      }
    })()
    flights.set(key, task)
    return task
  }
  return { summaries: {}, load, retry: (runId) => load(runId, true) }
})

export function useTrend(run) {
  const key = trendKey(run?.id)
  const entry = useTrendStore((s) => s.summaries[key] || EMPTY)
  const load = useTrendStore((s) => s.load)
  useEffect(() => { if (run?._server) void load(run.id) }, [run?.id, run?._server, load])
  const active = ['queued', 'running'].includes(entry.data?.status)
  useEffect(() => {
    if (!run?._server || !active || entry.error) return
    const timer = setInterval(() => { void load(run.id) }, 2000)
    return () => clearInterval(timer)
  }, [run?.id, run?._server, active, entry.error, load])
  return entry
}
