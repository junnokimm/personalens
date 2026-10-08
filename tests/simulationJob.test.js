/* useSimulationJob(startRun/retryRun과 타이머) 단위 테스트.
 * useProjectStore와 마찬가지로 모듈 싱글턴이라 vi.resetModules()로 매번 새로 가져온다. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useSimulationJob', () => {
  it('실행을 시작하면 타이머가 자동으로 완료까지 진행하고 완료 토스트를 띄운다', async () => {
    vi.useFakeTimers()
    const { useProjectStore } = await import('../src/store/useProjectStore.js')
    const { useUiStore } = await import('../src/store/useUiStore.js')
    const { startRun } = await import('../src/store/useSimulationJob.js')
    const projectId = useProjectStore.getState().projects[0].id

    const result = startRun(projectId)
    expect(result.ok).toBe(true)
    expect(useUiStore.getState().toast?.text).toBe(`실행 #${result.runNumber}을 시작했습니다.`)

    vi.advanceTimersByTime(450 * 10)

    const run = useProjectStore.getState().projects.find((p) => p.id === projectId).runs.find((r) => r.id === result.runId)
    expect(run.status).toBe('completed')
    expect(useUiStore.getState().toast).toEqual({
      text: `실행 #${result.runNumber}이 완료됐습니다.`,
      actionLabel: '결과 보기',
      action: { to: `/p/${projectId}/results/${result.runId}` },
    })
  })

  it('진행 중인 실행이 있으면 새로 시작할 수 없다', async () => {
    vi.useFakeTimers()
    const { useProjectStore } = await import('../src/store/useProjectStore.js')
    const { useUiStore } = await import('../src/store/useUiStore.js')
    const { startRun } = await import('../src/store/useSimulationJob.js')
    const projectId = useProjectStore.getState().projects[0].id

    startRun(projectId)
    const second = startRun(projectId)
    expect(second.ok).toBe(false)
    expect(useUiStore.getState().toast?.text).toBe('진행 중인 실행이 끝난 뒤 다시 실행하세요.')
  })
})
