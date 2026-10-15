import { groupFlowState } from '../../lib/cohort.js'
import { modelFlowState } from '../../lib/models.js'
import { surveyFlowState } from '../../lib/survey.js'

/* 사이드바용 짧은 문구 — lib/survey.js·lib/cohort.js의 상태 코드와 한 쌍을 이룬다.
 * 화면(SurveyPage 등)은 같은 코드에 더 긴 문구(flow.label)를 쓴다 */
const SURVEY_NAV = {
  empty: { c: 'todo', i: '', t: '작성 중' },
  error: { c: 'bad', i: '!', t: '수정 필요' },
  changed: { c: 'warn', i: '!', t: '변경됨' },
  ready: { c: 'ok', i: '✓', t: '준비 완료' },
}
const GROUP_NAV_BAD = { c: 'bad', i: '!', t: '수정 필요' }
const GROUP_NAV_STALE = { c: 'warn', i: '!', t: '재구성 필요' }
const GROUP_NAV_UNBUILT = { c: 'todo', i: '', t: '구성 전' }
const MODEL_NAV = {
  empty: { c: 'todo', i: '', t: '선택 전' },
  'needs-key': { c: 'warn', i: '!', t: 'API 키 필요' },
}

/* 원본 navStatus(): 설계 메뉴의 "확인 필요"/"구성 필요" 등 표시 */
export function navStatus(project, hasKey) {
  const survey = SURVEY_NAV[surveyFlowState(project.survey, project.runs.length > 0).code]

  const groupCodes = project.groups.map((g) => groupFlowState(g).code)
  const groups = groupCodes.includes('invalid') ? GROUP_NAV_BAD
    : groupCodes.includes('stale') ? GROUP_NAV_STALE
      : groupCodes.includes('unbuilt') ? GROUP_NAV_UNBUILT
        : { c: 'ok', i: '✓', t: project.groups.length + '개 구성 완료' }

  const modelFlow = modelFlowState(project.model, hasKey)
  const model = MODEL_NAV[modelFlow.code] || { c: 'ok', i: '✓', t: modelFlow.label.replace(' 선택됨', '') }

  return { survey, groups, model }
}

export function StatusMark({ x }) {
  return (
    <span className={`st ${x.c}`} title={x.t}>
      {x.t}{x.i ? <b>{x.i}</b> : null}
    </span>
  )
}
