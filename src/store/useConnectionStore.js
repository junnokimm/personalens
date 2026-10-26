import { create } from 'zustand'
import { request } from '../lib/projectApi.js'

export const PROVIDER_NAMES = { openai: 'OpenAI', anthropic: 'Anthropic', dgx: 'DGX Spark' }
export const CONNECTION_STATUS = { unchecked: '확인 전', ready: '모델 목록 확인됨', manual: '모델 ID 직접 등록', error: '연결 확인 필요' }

// Public metadata only. Keys are held briefly by the form and never enter a store.
export const useConnectionStore = create((set) => ({
  connections: [], dgxAllowedBaseUrls: [], mockMode: false, loading: false, error: '', loaded: false,
  async load() {
    set({ loading: true, error: '' })
    try { set({ ...await request('/connections'), loaded: true }) }
    catch (error) { set({ error: error.message }) }
    finally { set({ loading: false }) }
  },
  async save(id, body) {
    const row = await request(`/connections${id ? '/' + encodeURIComponent(id) : ''}`, { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) })
    set((s) => ({ connections: [...s.connections.filter((c) => c.id !== row.id), row] }))
    return row
  },
  async check(id) {
    const row = await request(`/connections/${encodeURIComponent(id)}/check`, { method: 'POST' })
    set((s) => ({ connections: s.connections.map((c) => c.id === id ? row : c) }))
    return row
  },
}))
