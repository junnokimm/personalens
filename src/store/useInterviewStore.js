import { useEffect } from 'react'
import { create } from 'zustand'
import { getSessionIdentity, request } from '../lib/projectApi.js'

const path = (rid, pid) => `/runs/${encodeURIComponent(rid)}/personas/${encodeURIComponent(pid)}/interviews`
export const interviewKey = (rid, pid) => `${rid}::${pid}`
const EMPTY = { turns: [], loaded: false, loading: false, sending: false, error: '' }
const active = (t) => ['queued', 'running'].includes(t.status)
const flights = new Map()
const storageKeyFor = (rid, pid) => `personalens-interview:${getSessionIdentity()}:${interviewKey(rid, pid)}`
export function pendingInterview(rid, pid) {
  try { return JSON.parse(sessionStorage.getItem(storageKeyFor(rid, pid))) } catch { return null }
}

export const useInterviewStore = create((set, get) => {
  const update = (key, patch) => set((s) => ({ threads: { ...s.threads, [key]: { ...EMPTY, ...s.threads[key], ...patch } } }))
  return {
    threads: {},
    load(rid, pid) {
      const key = interviewKey(rid, pid)
      if (flights.has(key)) return flights.get(key)
      update(key, { loading: true })
      const promise = request(path(rid, pid)).then((data) => {
        const merged = new Map((get().threads[key]?.turns || []).map((t) => [t.id, t]))
        for (const turn of data.turns) {
          if (!merged.has(turn.id) || merged.get(turn.id).updated <= turn.updated) merged.set(turn.id, turn)
        }
        const pending = pendingInterview(rid, pid)
        if (pending && data.turns.some((t) => t.requestId === pending.requestId)) try { sessionStorage.removeItem(storageKeyFor(rid, pid)) } catch { /* optional */ }
        update(key, { ...data, turns: [...merged.values()].sort((a, b) => a.sequence - b.sequence), loaded: true, error: '' })
      })
        .catch((error) => update(key, { error: error.message }))
        .finally(() => { update(key, { loading: false }); flights.delete(key) })
      flights.set(key, promise)
      return promise
    },
    async send(rid, pid, questionId, question) {
      const key = interviewKey(rid, pid)
      if (get().threads[key]?.sending || get().threads[key]?.turns.some(active)) return false
      update(key, { sending: true, error: '' })
      const storageKey = storageKeyFor(rid, pid)
      let body
      try {
        try { body = JSON.parse(sessionStorage.getItem(storageKey)) } catch { /* optional */ }
        if (body && (body.question !== question || body.questionId !== questionId)) throw Error('접수 확인 중인 질문이 있습니다. 이전 질문을 같은 문항으로 다시 보내 접수를 확인하세요.')
        body ||= { requestId: crypto.randomUUID(), questionId, question }
        try { sessionStorage.setItem(storageKey, JSON.stringify(body)) } catch { /* optional */ }
        const turn = await request(path(rid, pid), { method: 'POST', body: JSON.stringify(body) })
        try { sessionStorage.removeItem(storageKey) } catch { /* optional */ }
        const turns = get().threads[key]?.turns || []
        update(key, { turns: [...turns.filter((t) => t.id !== turn.id), turn].sort((a, b) => a.sequence - b.sequence), loaded: true })
        return true
      } catch (error) {
        if (error.status >= 400 && error.status < 500) try { sessionStorage.removeItem(storageKey) } catch { /* optional */ }
        update(key, { error: error.message })
        return false
      } finally { update(key, { sending: false }) }
    },
    async action(rid, pid, turnId, action) {
      const key = interviewKey(rid, pid)
      if (get().threads[key]?.sending) return
      update(key, { sending: true, error: '' })
      try {
        const turn = await request(`/interviews/${encodeURIComponent(turnId)}/${action}`, { method: 'POST' })
        update(key, { turns: get().threads[key].turns.map((t) => t.id === turn.id ? turn : t) })
      } catch (error) { update(key, { error: error.message }) }
      finally { update(key, { sending: false }) }
    },
  }
})

export function useInterview(rid, pid, enabled) {
  const thread = useInterviewStore((s) => s.threads[interviewKey(rid, pid)] || EMPTY)
  const load = useInterviewStore((s) => s.load)
  const pending = thread.turns.some(active)
  useEffect(() => { if (enabled && pid) void load(rid, pid) }, [rid, pid, enabled, load])
  useEffect(() => {
    if (!enabled || !pid || (!pending && !thread.error)) return
    const timer = setInterval(() => { void load(rid, pid) }, 2000)
    return () => clearInterval(timer)
  }, [rid, pid, enabled, pending, thread.error, load])
  return { ...thread, pending }
}
