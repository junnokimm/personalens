/* useProjectStore/useUiStore 액션 단위 테스트.
 * 스토어는 모듈을 import할 때 localStorage를 읽어 한 번만 만들어지므로(싱글턴),
 * 시나리오마다 localStorage를 먼저 채우고 vi.resetModules()로 모듈 캐시를 비운 뒤
 * 다시 import해서 "새로고침"을 흉내 낸다. */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STORE_KEY = 'personascope-proto-v4'

function readFixture(name) {
  return readFileSync(path.join(__dirname, 'fixtures', name), 'utf8')
}

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})

describe('useProjectStore', () => {
  it('문항을 추가·삭제하고 삭제를 취소할 수 있다', async () => {
    const { useProjectStore } = await import('../src/store/useProjectStore.js')
    const { useUiStore } = await import('../src/store/useUiStore.js')
    const projectId = useProjectStore.getState().projects[0].id
    const before = useProjectStore.getState().projects.find((p) => p.id === projectId).survey.questions.length

    const qid = useProjectStore.getState().addQ(projectId, 'choice')
    let survey = useProjectStore.getState().projects.find((p) => p.id === projectId).survey
    expect(survey.questions.length).toBe(before + 1)
    expect(survey.questions.some((q) => q.id === qid)).toBe(true)

    useProjectStore.getState().deleteQ(projectId, qid)
    survey = useProjectStore.getState().projects.find((p) => p.id === projectId).survey
    expect(survey.questions.length).toBe(before)
    expect(useUiStore.getState().lastDeleted).not.toBeNull()
    expect(useUiStore.getState().toast?.actionLabel).toBe('실행 취소')

    useProjectStore.getState().undoDelete(projectId)
    survey = useProjectStore.getState().projects.find((p) => p.id === projectId).survey
    expect(survey.questions.length).toBe(before + 1)
    expect(survey.questions.some((q) => q.id === qid)).toBe(true)
    expect(useUiStore.getState().lastDeleted).toBeNull()
  })

  it('실행을 시작하면 편집 중이던 설문 버전이 확정된다', async () => {
    const { useProjectStore } = await import('../src/store/useProjectStore.js')
    const projectId = useProjectStore.getState().projects[0].id

    useProjectStore.getState().editS(projectId, 'title', '수정된 제목')
    let survey = useProjectStore.getState().projects.find((p) => p.id === projectId).survey
    expect(survey.draft).toBe(true)
    const prevVersion = survey.version

    const result = useProjectStore.getState().startRun(projectId)
    expect(result.ok).toBe(true)

    survey = useProjectStore.getState().projects.find((p) => p.id === projectId).survey
    expect(survey.draft).toBe(false)
    expect(survey.version).toBe(prevVersion + 1)
  })

  it('실행을 시작하면 10%씩 올라가 완료된다', async () => {
    const { useProjectStore } = await import('../src/store/useProjectStore.js')
    const projectId = useProjectStore.getState().projects[0].id

    const result = useProjectStore.getState().startRun(projectId)
    expect(result.ok).toBe(true)

    let last
    for (let i = 0; i < 10; i++) last = useProjectStore.getState().tick(projectId, result.runId)
    expect(last).toEqual({ status: 'completed', number: result.runNumber })

    const run = useProjectStore.getState().projects.find((p) => p.id === projectId).runs.find((r) => r.id === result.runId)
    expect(run.status).toBe('completed')
    expect(run.progress).toBe(100)
  })

  it('실패 시연(failNext)을 켜면 60%에서 실패한다', async () => {
    const { useProjectStore } = await import('../src/store/useProjectStore.js')
    const projectId = useProjectStore.getState().projects[0].id

    const result = useProjectStore.getState().startRun(projectId, { failNext: true })
    expect(result.ok).toBe(true)

    let last
    for (let i = 0; i < 6; i++) last = useProjectStore.getState().tick(projectId, result.runId)
    expect(last.status).toBe('failed')

    const run = useProjectStore.getState().projects.find((p) => p.id === projectId).runs.find((r) => r.id === result.runId)
    expect(run.status).toBe('failed')
    expect(run.progress).toBe(60)
    expect(run.failNote).toBe('60%에서 멈췄습니다 · 성공 응답 ' + Math.round(run.responses.length * 0.6) + '개')
  })

  it('새로고침하면 running 상태로 저장된 실행이 failed로 바뀐다', async () => {
    localStorage.setItem(STORE_KEY, readFixture('legacy-v4-storage-running.json'))

    const { useProjectStore } = await import('../src/store/useProjectStore.js')
    const run = useProjectStore.getState().projects[0].runs[0]
    expect(run.status).toBe('failed')
    expect(run.failNote).toBe('페이지를 새로 열어 실행이 멈췄습니다.')
  })

  it('원본 index.html이 저장한 localStorage 데이터를 그대로 읽는다', async () => {
    const fixtureText = readFixture('legacy-v4-storage.json')
    localStorage.setItem(STORE_KEY, fixtureText)
    const fixtureData = JSON.parse(fixtureText)

    const { useProjectStore } = await import('../src/store/useProjectStore.js')
    expect(useProjectStore.getState().projects).toEqual(fixtureData.projects)

    // 다시 저장해도 { projects: [...] } 그대로(persist의 { state, version } 래퍼가 섞이지 않음)
    useProjectStore.getState().touch(fixtureData.projects[0].id)
    const saved = JSON.parse(localStorage.getItem(STORE_KEY))
    expect(Object.keys(saved)).toEqual(['projects'])
    expect(saved.projects[0].id).toBe(fixtureData.projects[0].id)
  })

  it('localStorage가 비어 있으면 예시 프로젝트를 만든다', async () => {
    const { useProjectStore } = await import('../src/store/useProjectStore.js')
    expect(useProjectStore.getState().projects.length).toBe(1)
    expect(useProjectStore.getState().projects[0].runs[0].status).toBe('completed')
  })
})
