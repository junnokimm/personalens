import { useEffect } from 'react'

import { useProjectStore } from './useProjectStore.js'
import { useUiStore } from './useUiStore.js'

/* 원본 job: setInterval 핸들 하나만 존재. 어떤 화면으로 이동해도 계속되도록 모듈 전역에 둔다 */
let intervalId = null
let activeKey = null

function stopTick() {
  if (intervalId != null) clearInterval(intervalId)
  intervalId = null
  activeKey = null
}

/* 원본 tick(pid, rid): 450ms마다 10%씩 올리고, 실패 시연·완료·실패를 처리한다 */
function tick(projectId, runId) {
  const key = projectId + '::' + runId
  if (activeKey === key) return
  stopTick()
  activeKey = key
  intervalId = setInterval(() => {
    const result = useProjectStore.getState().tick(projectId, runId)
    if (!result) { stopTick(); return }
    if (result.status === 'failed') {
      stopTick()
      useUiStore.getState().showToast(`실행 #${result.number}이 실패했습니다.`, '실행 기록 보기', { to: `/p/${projectId}/runs` })
      return
    }
    if (result.status === 'completed') {
      stopTick()
      useUiStore.getState().showToast(`실행 #${result.number}이 완료됐습니다.`, '결과 보기', { to: `/p/${projectId}/results/${runId}` })
    }
  }, 450)
}

/* 원본 startRun(): 진행 중인 실행이 있으면 막고, 새 실행을 만들어 바로 타이머를 시작한다 */
export function startRun(projectId) {
  const failNext = useUiStore.getState().failNext
  const result = useProjectStore.getState().startRun(projectId, { failNext })
  if (!result.ok) { useUiStore.getState().showToast(result.error); return result }
  tick(projectId, result.runId)
  useUiStore.getState().showToast(`실행 #${result.runNumber}을 시작했습니다.`)
  return result
}

/* 원본 retryRun(id): 실패한 실행을 다시 running으로 돌리고 타이머를 다시 시작한다 */
export function retryRun(projectId, runId) {
  useProjectStore.getState().retryRun(projectId, runId)
  tick(projectId, runId)
}

/* App에 한 번만 마운트. 컴포넌트 마운트·언마운트와 무관하게 타이머는 모듈 전역에서 하나만 돈다 —
   여기서는 새로고침 등으로 타이머가 끊긴 채 running 상태만 남은 실행이 있으면 다시 이어 돈다 */
export function useSimulationJob() {
  useEffect(() => {
    for (const p of useProjectStore.getState().projects) {
      const r = p.runs.find((x) => x.status === 'running')
      if (r) tick(p.id, r.id)
    }
  }, [])
}
