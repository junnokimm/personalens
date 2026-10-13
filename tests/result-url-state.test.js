import { describe, expect, it } from 'vitest'

import { distribution, filterPeople } from '../src/lib/analysis.js'
import { sample } from '../src/lib/sample.js'
import { attrValue } from '../src/lib/schema.js'

async function loadUrlStateModule() {
  try {
    return await import('../src/pages/results/resultUrlState.js')
  } catch {
    return {}
  }
}

function resultFixture() {
  const run = sample().runs[0]
  const question = run.survey.questions.find((item) => item.type !== 'text')
  const answer = distribution(run, question.id).findIndex((item) => item.count > 0)
  const people = filterPeople(run, { [`resp:${question.id}`]: [String(answer)] })
  const person = people[0]
  return { run, question, answer, person, sex: attrValue(person, 'sex') }
}

describe('결과 URL 탐색 상태', () => {
  it('문항·응답·드릴다운·페르소나·인터뷰 문항을 URL에서 복원한다', async () => {
    // Given: 공유 가능한 결과 탐색 URL
    const { run, question, answer, person, sex } = resultFixture()
    const params = new URLSearchParams({ view: 'chat', run: run.id, q: question.id, answer: String(answer), seg: 'age', persona: person.id, chatQ: question.id })
    params.append('attr', `sex:${sex}`)
    const module = await loadUrlStateModule()

    // When: 실행 데이터 기준으로 URL을 해석한다
    const state = module.parseResultUrlState?.(run, params)

    // Then: 핵심 탐색 맥락이 모두 복원된다
    expect(state).toEqual({
      view: 'chat',
      qid: question.id,
      drill: { answer, attrs: [{ key: 'sex', value: sex }] },
      segKey: 'age',
      personaId: person.id,
      chatQid: question.id,
    })
  })

  it('다른 실행의 잘못된 선택 상태는 안전한 기본 화면으로 복원한다', async () => {
    // Given: 다른 실행의 문항과 페르소나 ID가 담긴 URL
    const previous = resultFixture()
    const run = sample().runs[0]
    const params = new URLSearchParams({ view: 'chat', run: previous.run.id, q: previous.question.id, answer: '99', persona: previous.person.id, chatQ: previous.question.id })
    params.append('attr', 'unknown:value')
    const module = await loadUrlStateModule()

    // When: 현재 실행 데이터 기준으로 URL을 해석한다
    const state = module.parseResultUrlState?.(run, params)

    // Then: 현재 실행의 첫 문항과 페르소나 목록으로 돌아간다
    const fallbackQid = run.survey.questions.find((item) => item.type !== 'text')?.id || run.survey.questions[0].id
    expect(state).toEqual({
      view: 'personas',
      qid: fallbackQid,
      drill: { answer: null, attrs: [] },
      segKey: 'sex',
      personaId: null,
      chatQid: fallbackQid,
    })
  })

  it('탐색 상태를 갱신할 때 기존의 관련 없는 쿼리 파라미터를 보존한다', async () => {
    // Given: 외부 파라미터가 포함된 전체 결과 URL
    const { run, question, answer, sex } = resultFixture()
    const current = new URLSearchParams('view=overall&utm=keep')
    const module = await loadUrlStateModule()

    // When: 집단 분석 상태로 URL을 갱신한다
    const next = module.updateResultSearchParams?.(run, current, {
      view: 'segment',
      qid: question.id,
      drill: { answer, attrs: [{ key: 'sex', value: sex }] },
      segKey: 'age',
    })

    // Then: 탐색 파라미터와 기존 외부 파라미터가 함께 남는다
    expect(next?.get('view')).toBe('segment')
    expect(next?.get('q')).toBe(question.id)
    expect(next?.get('answer')).toBe(String(answer))
    expect(next?.getAll('attr')).toEqual([`sex:${sex}`])
    expect(next?.get('utm')).toBe('keep')
  })
})
