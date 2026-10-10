import { groupFlowState } from '../../lib/cohort.js'
import { validateSurvey } from '../../lib/survey.js'

/* 원본 navStatus(): 설계 메뉴의 "확인 필요"/"구성 필요" 등 표시 */
export function navStatus(project) {
  const errs = validateSurvey(project.survey).summary.length
  const untouched = !project.survey.title.trim() && !project.survey.questions.length
  const survey = errs && untouched
    ? { c: 'todo', i: '', t: '작성 중' }
    : errs
      ? { c: 'bad', i: '!', t: '수정 필요' }
    : project.survey.draft && project.runs.length
      ? { c: 'warn', i: '!', t: '변경됨' }
      : { c: 'ok', i: '✓', t: '준비 완료' }
  const groupStates = project.groups.map(groupFlowState)
  const groups = groupStates.some((state) => state.tone === 'bad')
    ? { c: 'bad', i: '!', t: '수정 필요' }
    : groupStates.some((state) => state.label === '조건 변경으로 재구성 필요')
      ? { c: 'warn', i: '!', t: '재구성 필요' }
      : groupStates.some((state) => state.label === '구성 전')
        ? { c: 'todo', i: '', t: '구성 전' }
        : { c: 'ok', i: '✓', t: project.groups.length + '개 구성 완료' }
  return { survey, groups }
}

export function StatusMark({ x }) {
  return (
    <span className={`st ${x.c}`} title={x.t}>
      {x.t}{x.i ? <b>{x.i}</b> : null}
    </span>
  )
}
