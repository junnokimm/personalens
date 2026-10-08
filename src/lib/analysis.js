import { attrValue, sortValues } from './schema'
import { choices } from './survey'

/* ---------- 결과 계산 ---------- */
export function validResponses(r, qid) {
  const q = r.survey.questions.find((x) => x.id === qid), n = choices(q).length, seen = new Set()
  return r.responses.filter((x) => {
    if (x.questionId !== qid || seen.has(x.personaId)) return false
    if (q.type === 'text' ? !x.text?.trim() : !(Number.isInteger(x.answer) && x.answer >= 0 && x.answer < n)) return false
    seen.add(x.personaId); return true
  })
}
export const answerOf = (r, pid, qid) => r.responses.find((x) => x.personaId === pid && x.questionId === qid)
export function distribution(r, qid) {
  const q = r.survey.questions.find((x) => x.id === qid), rows = validResponses(r, qid)
  return choices(q).map((label, i) => { const count = rows.filter((x) => x.answer === i).length; return { label, count, percent: rows.length ? (count / rows.length) * 100 : 0 } })
}
export const responseStats = (r, qid) => { const valid = validResponses(r, qid).length; return { valid, missing: r.people.length - valid } }
/* 필터: { key: [값…] } (속성 표시값) + { 'resp:문항id': ['0','2'] } (응답 번호) */
export function matches(r, person, filters) {
  for (const [key, values] of Object.entries(filters)) {
    if (!values?.length) continue
    if (key.startsWith('resp:')) { const a = answerOf(r, person.id, key.slice(5)); if (!a || !values.includes(String(a.answer))) return false }
    else if (!values.includes(attrValue(person, key))) return false
  }
  return true
}
export const filterPeople = (r, filters, people = r.people) => people.filter((p) => matches(r, p, filters))
export function breakdown(people, key) {
  const counts = {}
  for (const p of people) { const v = attrValue(p, key); counts[v] = (counts[v] || 0) + 1 }
  return sortValues(key, Object.keys(counts)).map((value) => ({ value, count: counts[value], percent: people.length ? (counts[value] / people.length) * 100 : 0 }))
}
