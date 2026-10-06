import { clone, uid } from './random'

/* ---------- 설문 ---------- */
export function question(type = 'choice', parentId = null) {
  return { id: uid('q'), type, parentId, text: '', options: type === 'choice' ? ['선택지 1', '선택지 2'] : [], otherEnabled: false, scale: 5, low: '전혀 그렇지 않다', high: '매우 그렇다' }
}
/* 원래 문항 다음에 후속 질문이 오도록 정렬 */
export function ordered(survey) {
  const tops = survey.questions.filter((q) => !q.parentId)
  return tops.flatMap((t) => [t, ...survey.questions.filter((q) => q.parentId === t.id)])
}
/* 번호: 후속 질문이 없으면 Q2, 있으면 Q1-1, Q1-2 … — R-10 */
export function qLabel(survey, q) {
  const tops = survey.questions.filter((x) => !x.parentId)
  const top = q.parentId ? tops.find((t) => t.id === q.parentId) : q
  const n = tops.indexOf(top) + 1
  const kids = survey.questions.filter((x) => x.parentId === top.id)
  if (!kids.length) return 'Q' + n
  return 'Q' + n + '-' + (q.parentId ? kids.indexOf(q) + 2 : 1)
}
export const qKey = (survey, q) => qLabel(survey, q).toLowerCase().replace('-', '_')
export const TYPE_LABEL = { likert: '척도형', choice: '단일선택', text: '주관식' }

export function choices(q) {
  if (q.type === 'text') return []
  if (q.type === 'likert') return Array.from({ length: q.scale }, (_, i) => (i + 1) + '점' + (i === 0 ? ' · ' + q.low : i === q.scale - 1 ? ' · ' + q.high : ''))
  return q.otherEnabled ? [...q.options, '기타(직접 입력)'] : q.options.slice()
}
/* 응답값 표시 — R-21: "4점 / 5", 선택형은 선택지 이름 */
export function answerText(q, idx) {
  if (!Number.isInteger(idx)) return '응답 없음'
  if (q.type === 'likert') return (idx + 1) + '점 / ' + q.scale
  return choices(q)[idx] ?? '응답 없음'
}
export const isOther = (q, idx) => q.type === 'choice' && !!q.otherEnabled && idx === q.options.length

export function validateSurvey(s) {
  const summary = [], byId = {}
  const add = (q, key, msg) => { byId[q.id] = byId[q.id] || {}; byId[q.id][key] = msg; summary.push({ qid: q.id, msg }) }
  if (!s.title.trim()) summary.push({ qid: null, msg: '설문 주제를 입력하세요.' })
  if (!s.questions.length) summary.push({ qid: null, msg: '문항을 하나 이상 추가하세요.' })
  for (const q of ordered(s)) {
    const label = qLabel(s, q)
    if (!q.text.trim()) add(q, 'text', label + ' 질문 내용을 입력하세요.')
    if (q.type === 'choice') {
      const opts = q.options.map((o) => o.trim()), errs = {}
      opts.forEach((o, i) => { if (!o) errs[i] = '선택지 내용을 입력하세요.'; else if (opts.indexOf(o) !== i) errs[i] = `${opts.indexOf(o) + 1}번 선택지와 같습니다. 다른 이름을 입력하세요.` })
      if (opts.length < 2) add(q, 'general', label + ' 선택지를 2개 이상 입력하세요.')
      if (Object.keys(errs).length) { byId[q.id] = byId[q.id] || {}; byId[q.id].options = errs; summary.push({ qid: q.id, msg: label + ' 선택지를 확인하세요.' }) }
    }
    if (q.type === 'likert' && (!q.low.trim() || !q.high.trim())) add(q, 'general', label + ' 척도 양끝 이름을 입력하세요.')
  }
  return { summary, byId }
}
export const surveyError = (s) => validateSurvey(s).summary[0]?.msg || ''
/* 버전: 편집 중에는 올리지 않고 실행할 때 확정 — N-01 / R-11 */
export const versionText = (s) => (s.draft || !s.version ? 'v' + (s.version + 1) + ' 편집 중' : 'v' + s.version)
export function lockVersion(s) {
  if (s.draft || !s.version) {
    s.version += 1; s.draft = false
    s.history = s.history || []
    s.history.push({ version: s.version, created: new Date().toISOString(), title: s.title, description: s.description, questions: clone(s.questions) })
  }
  return s.version
}
