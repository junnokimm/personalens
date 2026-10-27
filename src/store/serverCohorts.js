import { getSessionIdentity, request, stableJson } from '../lib/projectApi.js'

const signature = (g) => stableJson({ count: g.count, filters: g.filters })

export function createServerCohortActions(set, get, getSync) {
  const flights = new Map()
  return {
    buildingCohorts: {},
    buildServerCohort(projectId, groupId, datasetId) {
      const key = projectId + ':' + groupId
      if (flights.has(key)) return flights.get(key)
      set((state) => { state.buildingCohorts[key] = true })
      const promise = (async () => {
        const storageKey = 'personalens-cohort-request:' + getSessionIdentity() + ':' + key
        let pending
        try {
          if (!await getSync().flush(projectId)) throw Error('대상 조건 저장을 완료한 뒤 구성하세요. 상단 저장 상태를 확인하세요.')
          const base = getSync().getBase(projectId)
          const group = base?.groups.find((g) => g.id === groupId)
          if (!group) throw Error('대상 집단을 먼저 저장하세요.')
          const guard = signature(group)
          try { pending = JSON.parse(sessionStorage.getItem(storageKey)) } catch { /* optional recovery */ }
          if (!pending || pending.guard !== guard || pending.body.datasetId !== datasetId) {
            pending = { guard, body: { datasetId, groupId, expectedRevision: base.revision, requestId: crypto.randomUUID() } }
          }
          try { sessionStorage.setItem(storageKey, JSON.stringify(pending)) } catch { /* server retains snapshot */ }
          const cohort = await request('/projects/' + encodeURIComponent(projectId) + '/cohorts', {
            method: 'POST', body: JSON.stringify(pending.body), timeout: 120000,
          })
          const current = get().projects.find((p) => p.id === projectId)?.groups.find((g) => g.id === groupId)
          if (!current || signature(current) !== guard) throw Error('추출 중 대상 조건이 변경되었습니다. 현재 조건으로 다시 구성하세요.')
          set((state) => {
            const p = state.projects.find((p) => p.id === projectId)
            p.groups.find((g) => g.id === groupId).cohort = cohort
          })
          if (!await getSync().flush(projectId)) throw Error('추출은 완료됐지만 프로젝트 저장이 필요합니다. 상단에서 저장을 재시도하세요.')
          try { sessionStorage.removeItem(storageKey) } catch { /* optional */ }
          return { ok: true }
        } catch (error) {
          if (error.status >= 400 && error.status < 500) {
            try { sessionStorage.removeItem(storageKey) } catch { /* optional */ }
          }
          return { ok: false, error: error.message }
        } finally {
          set((state) => { delete state.buildingCohorts[key] })
        }
      })().finally(() => flights.delete(key))
      flights.set(key, promise)
      return promise
    },
  }
}
