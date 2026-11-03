import { getSessionIdentity } from './projectApi.js'

export function completedTrendRuns(runs) {
  return runs.filter((r) => r.status === 'completed').sort((a, b) =>
    new Date(b.finished || b.updated || b.created) - new Date(a.finished || a.updated || a.created) || b.number - a.number)
}

export function selectedTrendRun(runs, selection) {
  return runs.find((r) => r.id === selection) || runs[0] || null
}

const preferenceKey = (projectId) => `personalens-trend-choice:${getSessionIdentity() || 'local'}:${projectId}`
export function readTrendChoice(projectId) {
  try { return localStorage.getItem(preferenceKey(projectId)) || 'latest' } catch { return 'latest' }
}
export function saveTrendChoice(projectId, value) {
  try { localStorage.setItem(preferenceKey(projectId), value) } catch { /* URL still restores the selection. */ }
}
