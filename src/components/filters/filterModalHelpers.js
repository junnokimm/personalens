import personaSchema from '../../data/personaSchema.json'
import { answerOf, breakdown } from '../../lib/analysis.js'
import { ANALYSIS_KEYS, attrLabel, BIG5, field } from '../../lib/schema.js'
import { choices, qLabel } from '../../lib/survey.js'

/* 원본 conditions.js의 fmFields()/fmField()/fmOptions() — 전역 FM 대신 opts/base를 인자로 받는다 */
export function fmFields(opts) {
  if (opts.mode === 'target') {
    return personaSchema.fields.map((f) => ({ key: f.key, label: attrLabel(f.key), group: f.group, type: BIG5.includes(f.key) ? 'big5' : f.key === 'region' ? 'region' : f.type }))
  }
  const r = opts.run, out = []
  for (const q of r.survey.questions) if (q.type !== 'text') out.push({ key: 'resp:' + q.id, label: qLabel(r.survey, q) + ' 응답', group: '응답 조건', type: 'category' })
  for (const k of ANALYSIS_KEYS) out.push({ key: k, label: attrLabel(k), group: BIG5.includes(k) ? '성격 (5단계)' : '응답자 속성', type: 'category' })
  return out
}
export function fmField(opts, key) { return fmFields(opts).find((f) => f.key === key) }

/* 값 목록 {value,label,count} */
export function fmOptions(opts, base, key) {
  if (opts.mode === 'target') {
    return field(key).options.map((o) => ({ value: o.value, label: o.label, count: o.count }))
  }
  if (key.startsWith('resp:')) {
    const q = opts.run.survey.questions.find((x) => x.id === key.slice(5))
    return choices(q).map((label, i) => ({ value: String(i), label, count: base.filter((p) => answerOf(opts.run, p.id, q.id)?.answer === i).length }))
  }
  return breakdown(base, key).map((d) => ({ value: d.value, label: d.value, count: d.count }))
}
