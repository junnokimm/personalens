import { groupStale } from '../../lib/cohort.js'
import { validateSurvey, versionText } from '../../lib/survey.js'

/* 원본 navStatus(): 설계 메뉴의 "확인 필요"/"구성 필요" 등 표시 */
export function navStatus(project) {
  const errs = validateSurvey(project.survey).summary.length
  const stale = project.groups.filter(groupStale).length
  const survey = errs
    ? { c: 'bad', i: '!', t: '확인 필요' }
    : project.survey.draft && project.runs.length
      ? { c: 'warn', i: '!', t: versionText(project.survey) }
      : !project.survey.version
        ? { c: 'todo', i: '', t: versionText(project.survey) }
        : { c: 'ok', i: '✓', t: 'v' + project.survey.version }
  const groups = stale ? { c: 'warn', i: '!', t: '구성 필요' } : { c: 'ok', i: '✓', t: project.groups.length + '개' }
  return { survey, groups }
}

export function StatusMark({ x }) {
  return (
    <span className={`st ${x.c}`} title={x.t}>
      {x.t}{x.i ? <b>{x.i}</b> : null}
    </span>
  )
}
