import { Fragment } from 'react'
import { useNavigate } from 'react-router-dom'

import Banner from '../../components/common/Banner.jsx'
import { groupFlowState } from '../../lib/cohort.js'
import { modelFlowState } from '../../lib/models.js'
import { surveyFlowState } from '../../lib/survey.js'
import { useUiStore } from '../../store/useUiStore.js'

/* 설계 3단계(설문 → 대상 집단 → 응답 모델)의 순서·경로·완료 여부 — 위쪽 단계 표시와 아래쪽 이전/다음이 같이 쓴다 */
export function useDesignSteps(project) {
  const hasKey = useUiStore((s) => !!s.apiKeys[project.id]?.trim())
  const g = project.groups.find((x) => x.id === project.activeGroupId) || project.groups[0]
  return [
    { key: 'survey', label: '설문', path: `/p/${project.id}/design/survey`, flow: surveyFlowState(project.survey, project.runs.length > 0) },
    { key: 'target', label: '대상 집단', path: `/p/${project.id}/design/target`, flow: groupFlowState(g) },
    { key: 'model', label: '응답 모델', path: `/p/${project.id}/design/model`, flow: modelFlowState(project.model, hasKey) },
  ]
}

/* 화면 위 단계 표시 — 지금 단계는 강조, 끝낸 단계는 ✓. 누르면 그 단계로 바로 간다 */
export function DesignStepper({ project, current }) {
  const navigate = useNavigate()
  const steps = useDesignSteps(project)
  const doneCount = steps.filter((s) => s.flow.ready).length
  return (
    <nav className="design-steps" aria-label={`설계 단계 · ${steps.length}단계 중 ${doneCount}단계 완료`}>
      {steps.map((s, i) => {
        const on = s.key === current
        const done = s.flow.ready
        return (
          <Fragment key={s.key}>
            {i ? <span className="ds-line" aria-hidden="true" /> : null}
            <button
              className={`ds-step ${on ? 'on' : ''} ${done ? 'done' : ''}`}
              aria-current={on ? 'step' : undefined}
              onClick={() => navigate(s.path)}
            >
              <span className="ds-n" aria-hidden="true">{done ? '✓' : i + 1}</span>
              <span className="ds-text">
                <b>{i + 1}. {s.label}</b>
                <small>{done ? '완료' : s.flow.label}</small>
              </span>
            </button>
          </Fragment>
        )
      })}
    </nav>
  )
}

/* 화면 아래 이전/다음 — 단계가 끝나지 않아도 이동은 막지 않고, 지금 상태만 알려 준다.
 * 마지막 단계의 '다음'은 시뮬레이션 */
export function DesignStepNav({ project, current, children }) {
  const navigate = useNavigate()
  const steps = useDesignSteps(project)
  const i = steps.findIndex((s) => s.key === current)
  const step = steps[i]
  const prev = steps[i - 1]
  const next = steps[i + 1] || { label: '시뮬레이션', path: `/p/${project.id}/simulation` }
  const allReady = steps.every((s) => s.flow.ready)
  return (
    <Banner
      tone={step.flow.ready ? 'info' : step.flow.tone === 'bad' ? 'bad' : 'todo'}
      actions={(
        <>
          {prev ? <button onClick={() => navigate(prev.path)}>← 이전: {prev.label}</button> : null}
          <button className="primary" onClick={() => navigate(next.path)}>다음: {next.label} →</button>
        </>
      )}
    >
      <b>{i + 1}단계 {step.label} · {step.flow.ready ? '완료' : step.flow.label}</b>
      <p className="small-text">
        {children}
        {!steps[i + 1] && !allReady ? ` 끝나지 않은 단계: ${steps.filter((s) => !s.flow.ready).map((s) => s.label).join(', ')}` : ''}
      </p>
    </Banner>
  )
}
