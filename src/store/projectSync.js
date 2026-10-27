import { projectDocument, stableJson } from '../lib/projectApi.js'

export const OUTBOX_KEY = 'personalens-project-outbox-v1'

// One writer per project. An acknowledgement updates the revision, never the editor's newer text.
export function createProjectSync({ api, storage, onStatus, onHydrate, onReplace, delay = 500 }) {
  let entries = {}
  let loadPromise = null
  let ready = false
  const bases = new Map()
  const timers = new Map()
  const flights = new Map()
  let storageError = false

  try {
    const recovered = JSON.parse(storage?.getItem(OUTBOX_KEY) || '{}')
    if (!recovered || typeof recovered !== 'object' || Array.isArray(recovered)) throw Error('Invalid outbox')
    for (const [id, entry] of Object.entries(recovered)) {
      if (!entry?.document || entry.document.id !== id || !Number.isInteger(entry.revision)) throw Error('Invalid draft')
    }
    entries = recovered
  } catch { storageError = true }

  function persist() {
    try {
      storage?.setItem(OUTBOX_KEY, JSON.stringify(entries))
      storageError = false
    } catch { storageError = true }
  }
  function publish() {
    onStatus({
      ready, storageError,
      projects: Object.fromEntries(Object.entries(entries).map(([id, entry]) => [id, {
        status: entry.conflict ? 'conflict' : entry.error ? 'error' : flights.has(id) ? 'saving' : 'pending',
        message: entry.error || '',
      }])),
    })
  }
  function cancelTimer(id) {
    clearTimeout(timers.get(id))
    timers.delete(id)
  }
  function schedule(id) {
    cancelTimer(id)
    if (entries[id]?.error || entries[id]?.conflict) return
    timers.set(id, setTimeout(() => { timers.delete(id); void flush(id) }, delay))
  }

  async function load() {
    if (ready) return true
    if (loadPromise) return loadPromise
    loadPromise = (async () => {
      const { projects } = await api.list()
      for (const remote of projects) bases.set(remote.id, remote)
      // Recover this tab's unsent edits after reload. Never silently replace another tab's work.
      for (const [id, entry] of Object.entries(entries)) {
        const remote = bases.get(id)
        if (entry.rejected) { entry.operation = null; entry.rejected = false }
        if (remote && entry.operation?.mutationId === remote.lastMutationId) {
          entry.revision = remote.revision
          entry.operation = null
        }
        if (remote && stableJson(entry.document) === stableJson(projectDocument(remote))) {
          delete entries[id]
          continue
        }
        entry.conflict = remote ? remote.revision !== entry.revision : entry.revision !== 0
        entry.error = null
        if (entry.conflict) entry.error = '다른 탭에서 프로젝트를 수정했습니다. 편집본을 보관한 뒤 서버 내용을 불러오세요.'
      }
      const restored = projects.map((remote) => entries[remote.id] ? { ...remote, ...entries[remote.id].document } : remote)
      for (const [id, entry] of Object.entries(entries)) {
        if (!bases.has(id)) restored.unshift({ ...entry.document, updated: new Date().toISOString() })
      }
      // Outbox documents contain server cohort references only. Recover their immutable
      // profiles before rendering, including a completed build not yet attached to a draft.
      for (const project of restored) {
        project.groups = project.groups.map((g) => ({ ...g }))
        for (const group of project.groups) {
          if (!group.cohort?.id || group.cohort.people) continue
          const cached = bases.get(project.id)?.groups.find((g) => g.cohort?.id === group.cohort.id)?.cohort
          group.cohort = cached || await api.getCohort(project.id, group.cohort.id)
        }
      }
      onHydrate(restored)
      ready = true
      persist()
      publish()
      for (const id of Object.keys(entries)) schedule(id)
      return true
    })().finally(() => { loadPromise = null })
    return loadPromise
  }

  function track(projects) {
    if (!ready) return
    for (const project of projects) {
      const document = projectDocument(project)
      const entry = entries[project.id]
      const previous = entry?.document || (bases.has(project.id) ? projectDocument(bases.get(project.id)) : null)
      if (stableJson(document) === stableJson(previous)) continue
      entries[project.id] = { ...entry, document, revision: entry?.revision ?? bases.get(project.id)?.revision ?? 0 }
      if (entry?.rejected) Object.assign(entries[project.id], { operation: null, error: null, rejected: false })
      persist()
      schedule(project.id)
    }
    publish()
  }

  async function send(id) {
    while (entries[id] && !entries[id].error && !entries[id].conflict) {
      const entry = entries[id]
      entry.operation ||= {
        expectedRevision: entry.revision,
        mutationId: crypto.randomUUID(),
        document: structuredClone(entry.document),
      }
      persist()
      const operation = entry.operation
      try {
        const remote = await api.save(operation)
        bases.set(id, remote)
        const latest = entries[id]
        if (stableJson(latest.document) === stableJson(operation.document)) delete entries[id]
        else {
          latest.revision = remote.revision
          latest.operation = null
        }
      } catch (error) {
        entries[id].error = error.message
        entries[id].rejected = error.status === 400 || error.status === 422
        entries[id].conflict = error.status === 409 || error.status === 404
        persist()
        publish()
        return false
      }
      persist()
      publish()
    }
    return !entries[id]
  }

  function flush(id) {
    cancelTimer(id)
    if (flights.has(id)) return flights.get(id)
    if (!entries[id] || entries[id].error || entries[id].conflict) return Promise.resolve(!entries[id])
    const flight = Promise.resolve().then(() => send(id)).finally(() => {
      flights.delete(id)
      publish()
    })
    flights.set(id, flight)
    publish()
    return flight
  }

  async function retry(id) {
    if (!entries[id] || entries[id].conflict) return false
    entries[id].error = null
    if (entries[id].rejected) { entries[id].operation = null; entries[id].rejected = false }
    publish()
    return flush(id)
  }

  async function reloadProject(id) {
    if (flights.has(id)) await flights.get(id)
    const remote = await api.get(id)
    cancelTimer(id)
    delete entries[id]
    bases.set(id, remote)
    // Suppress tracking the replacement as another local edit.
    ready = false
    onReplace(remote)
    ready = true
    persist()
    publish()
  }

  return {
    load, track, flush, retry, reloadProject,
    getBase: (id) => bases.get(id),
    hasPending: () => Object.keys(entries).length > 0,
    flushAll: () => Promise.all(Object.keys(entries).map(flush)),
    dispose: () => { for (const id of timers.keys()) cancelTimer(id) },
  }
}
