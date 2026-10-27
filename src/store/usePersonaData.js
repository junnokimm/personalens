import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { request, stableJson } from '../lib/projectApi.js'

let flight = null
export const usePersonaData = create((set) => ({
  schema: null, loading: false, error: '',
  load() {
    if (flight) return flight
    set({ loading: true, error: '' })
    flight = request('/persona-dataset', { timeout: 120000 })
      .then((schema) => { set({ schema }); return schema })
      .catch((error) => { set({ schema: null, error: error.message }); return null })
      .finally(() => { flight = null; set({ loading: false }) })
    return flight
  },
}))

export function usePersonaCount(schema, filters, enabled = true) {
  const key = stableJson({ datasetId: schema?.id, filters })
  const [state, setState] = useState(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!enabled || !schema?.id) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      request('/persona-dataset/count', { method: 'POST', body: key, timeout: 60000, signal: controller.signal })
        .then((result) => { if (!controller.signal.aborted) setState({ key, ...result, loading: false, error: '' }) })
        .catch((error) => { if (!controller.signal.aborted) setState({ key, loading: false, error: error.message }) })
    }, 350)
    return () => { clearTimeout(timer); controller.abort() }
  }, [key, schema?.id, enabled, attempt])
  if (!enabled) return null
  const retry = () => { setState(null); setAttempt((n) => n + 1) }
  return { ...(state?.key === key ? state : { loading: true, error: '', count: null }), retry }
}
