import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import * as cohortModule from '../src/lib/cohort.js'
import { navStatus } from '../src/components/layout/NavStatus.jsx'
import { RESPONSE_MODELS, modelFlowState } from '../src/lib/models.js'
import { sample } from '../src/lib/sample.js'
import * as surveyModule from '../src/lib/survey.js'
import SurveyPreviewModal from '../src/pages/design/SurveyPreviewModal.jsx'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

describe('설문 단계 연결 UX', () => {
  it('유효한 설문이면 다음 단계 진행 가능 상태를 반환한다', () => {
    // Given: 실행 가능한 예시 설문
    const survey = { ...sample().survey, draft: true }

    // When: 설문 단계 상태를 계산한다
    const state = surveyModule.surveyFlowState?.(survey, true)

    // Then: 실행 준비 완료 상태다
    expect(state).toEqual({ code: 'changed', tone: 'info', label: '이전 실행 이후 변경됨', ready: true })
  })

  it('설문 오류가 있으면 수정 필요 상태를 반환한다', () => {
    // Given: 주제가 비어 있는 설문
    const survey = { ...sample().survey, title: '' }

    // When: 설문 단계 상태를 계산한다
    const state = surveyModule.surveyFlowState?.(survey, true)

    // Then: 다음 단계로 진행할 수 없다
    expect(state).toEqual({ code: 'error', tone: 'bad', label: '수정 필요', ready: false })
  })

  it('주제도 문항도 없는 새 설문은 오류가 아니라 작성 전 상태를 반환한다', () => {
    // Given: 아직 아무것도 입력하지 않은 설문
    const survey = { title: '', description: '', version: 0, draft: true, history: [], questions: [] }

    // When: 설문 단계 상태를 계산한다
    const state = surveyModule.surveyFlowState?.(survey, false)

    // Then: 오류(error)가 아니라 작성 전(empty) 상태로 구분된다
    expect(state.code).toBe('empty')
    expect(state.ready).toBe(false)
  })

  it('설문 화면에 미리보기와 다음 단계 CTA 문구가 있다', () => {
    // Given: 설문 설계 화면 소스
    const source = readFileSync(path.join(__dirname, '../src/pages/design/SurveyPage.jsx'), 'utf8')

    // When: 사용자 흐름 문구를 확인한다
    const hasPreview = source.includes('설문 미리보기')
    const hasNextStep = source.includes('<DesignStepNav project={project} current="survey">')

    // Then: 두 동작을 사용자가 발견할 수 있다
    expect(hasPreview).toBe(true)
    expect(hasNextStep).toBe(true)
  })

  it('미리보기는 후속 질문과 척도 표현을 보여 주고 설문을 변경하지 않는다', () => {
    // Given: 후속 질문과 척도형 문항이 포함된 설문
    const survey = sample().survey
    const before = JSON.stringify(survey)

    // When: 읽기 전용 미리보기를 렌더링한다
    const html = renderToStaticMarkup(createElement(SurveyPreviewModal, { survey, onClose() {} }))

    // Then: 문항 관계와 척도 양끝이 보이고 원본 데이터는 그대로다
    expect(html).toContain('Q1-2')
    expect(html).toContain('Q1-1의 후속 질문')
    expect(html).toContain('1 · 전혀 동의하지 않음')
    expect(html).toContain('5 · 매우 동의함')
    expect(JSON.stringify(survey)).toBe(before)
  })
})

describe('대상 집단 단계 연결 UX', () => {
  it('현재 조건으로 구성된 집단만 다음 단계 진행 가능 상태다', () => {
    // Given: 현재 조건으로 구성된 예시 집단
    const group = sample().groups[0]

    // When: 대상 집단 단계 상태를 계산한다
    const state = cohortModule.groupFlowState?.(group)

    // Then: 구성 완료 상태다
    expect(state).toEqual({ code: 'built', tone: 'info', label: '구성 완료', ready: true })
  })

  it('조건이 바뀐 집단은 재구성 필요 상태다', () => {
    // Given: 구성 후 인원 수가 바뀐 집단
    const group = sample().groups[0]
    group.count += 1

    // When: 대상 집단 단계 상태를 계산한다
    const state = cohortModule.groupFlowState?.(group)

    // Then: 다음 단계로 진행할 수 없다
    expect(state).toEqual({ code: 'stale', tone: 'warn', label: '조건 변경으로 재구성 필요', ready: false })
  })

  it('대상 집단 화면에 시뮬레이션 CTA 문구가 있다', () => {
    // Given: 대상 집단 설계 화면 소스
    const source = readFileSync(path.join(__dirname, '../src/pages/design/TargetPage.jsx'), 'utf8')

    // When: 다음 단계 문구를 확인한다
    const hasNextStep = source.includes('<DesignStepNav project={project} current="target">')

    // Then: 사용자가 직접 다음 단계로 진행할 수 있다
    expect(hasNextStep).toBe(true)
  })
})

describe('사이드바 단계 상태', () => {
  it('검증된 설문과 집단은 준비 완료로 표시한다', () => {
    // Given: 설문과 두 집단이 모두 유효한 예시 프로젝트
    const project = sample()

    // When: 사이드바 상태를 계산한다
    const state = navStatus(project)

    // Then: 실제로 확인된 항목만 완료로 표시한다
    expect(state.survey).toEqual({ c: 'ok', i: '✓', t: '준비 완료' })
    expect(state.groups).toEqual({ c: 'ok', i: '✓', t: '2개 구성 완료' })
  })

  it('실행 이후 설문 변경과 집단 조건 변경을 구분한다', () => {
    // Given: 이전 실행 이후 설문과 집단 인원이 바뀐 프로젝트
    const project = sample()
    project.survey.draft = true
    project.groups[0].count += 1

    // When: 사이드바 상태를 계산한다
    const state = navStatus(project)

    // Then: 변경됨과 재구성 필요를 각각 표시한다
    expect(state.survey).toEqual({ c: 'warn', i: '!', t: '변경됨' })
    expect(state.groups).toEqual({ c: 'warn', i: '!', t: '재구성 필요' })
  })
})

describe('응답 모델 단계', () => {
  it('모델을 고르기 전에는 선택 전, 오픈 모델을 고르면 완료로 표시한다', () => {
    // Given: 모델을 아직 고르지 않은 예시 프로젝트
    const project = sample()

    // When/Then: 선택 전 → 오픈 모델 선택
    expect(modelFlowState(project.model, false).code).toBe('empty')
    expect(navStatus(project).model).toEqual({ c: 'todo', i: '', t: '선택 전' })
    project.model = { id: 'qwen' }
    expect(modelFlowState(project.model, false).ready).toBe(true)
    expect(navStatus(project).model).toEqual({ c: 'ok', i: '✓', t: 'Qwen' })
  })

  it('API 키가 필요한 모델은 키가 있어야 완료다', () => {
    // Given: GPT를 고른 프로젝트
    const model = { id: 'gpt' }

    // Then: 키가 없으면 키 필요, 있으면 완료
    expect(modelFlowState(model, false).code).toBe('needs-key')
    expect(modelFlowState(model, true).ready).toBe(true)
  })

  it('오픈 모델 여러 개와 GPT가 선택지에 있고, 모두 한 줄 설명 자리가 있다', () => {
    expect(RESPONSE_MODELS.filter((m) => m.open).length).toBeGreaterThanOrEqual(2)
    expect(RESPONSE_MODELS.some((m) => m.id === 'gpt' && m.needsKey)).toBe(true)
    expect(RESPONSE_MODELS.every((m) => typeof m.note === 'string' && m.note)).toBe(true)
  })
})
