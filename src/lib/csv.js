/* CSV 내보내기 — 하위 질문은 q1_1, q1_2처럼 열 이름을 붙입니다. */
import { attrValue, districtName } from './schema'
import { choices, isOther, qKey, qLabel } from './survey'

function cell(value) {
  let text = String(value ?? '')
  if (typeof value === 'string' && /^[\s]*[=+@-]/.test(text)) text = "'" + text // 스프레드시트 수식 방지
  return '"' + text.replace(/"/g, '""') + '"'
}
export const encode = (rows) => '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
function value(q, a) {
  if (q.type === 'text') return { code: '', score: '', label: '', other: '', text: a?.text || '', status: a?.text?.trim() ? 'valid' : 'missing' }
  const n = choices(q).length, ok = a && Number.isInteger(a.answer) && a.answer >= 0 && a.answer < n
  return { code: ok ? a.answer + 1 : '', score: ok && q.type === 'likert' ? a.answer + 1 : '', label: ok ? choices(q)[a.answer] : '', other: ok && isOther(q, a.answer) ? a.otherText || '' : '', text: '', status: ok ? 'valid' : 'missing' }
}
const baseHeaders = ['project_id', 'run_number', 'run_id', 'run_created', 'survey_version', 'target_group', 'persona_id', 'age_group', 'sex', 'region', 'district', 'occupation', 'income_bracket', 'is_synthetic', 'group_filters', 'profile_attributes']
const base = (p, r, person) => [p.id, r.number, r.id, r.created, r.survey.version, r.groupName, person.id, attrValue(person, 'age'), attrValue(person, 'sex'), attrValue(person, 'region'), districtName(person.attributes.district || ''), person.attributes.occupation || '', person.attributes.income_bracket || '', true, JSON.stringify(r.groupConfig.filters), JSON.stringify(person.attributes)]
export function rows(p, r, format) {
  const qs = r.survey.questions, key = (q) => qKey(r.survey, q)
  const look = new Map(); for (const a of r.responses) look.set(a.personaId + '::' + a.questionId, a)
  if (format === 'codebook') return [['run_number', 'question_column', 'question_label', 'follow_up_of', 'question_text', 'question_type', 'answer_code', 'answer_label', 'is_other'],
    ...qs.flatMap((q) => { const parent = q.parentId ? qLabel(r.survey, qs.find((x) => x.id === q.parentId)) : ''; return q.type === 'text' ? [[r.number, key(q), qLabel(r.survey, q), parent, q.text, q.type, '', '', false]] : choices(q).map((label, j) => [r.number, key(q), qLabel(r.survey, q), parent, q.text, q.type, j + 1, label, isOther(q, j)]) })]
  if (format === 'long') return [[...baseHeaders, 'question_column', 'question_label', 'question_text', 'question_type', 'answer_code', 'answer_label', 'scale_score', 'other_text', 'response_text', 'status'],
    ...r.people.flatMap((person) => qs.map((q) => { const v = value(q, look.get(person.id + '::' + q.id)); return [...base(p, r, person), key(q), qLabel(r.survey, q), q.text, q.type, v.code, v.label, v.score, v.other, v.text, v.status] }))]
  if (format === 'wide') return [[...baseHeaders, ...qs.flatMap((q) => ['code', 'score', 'label', 'other_text', 'response_text'].map((k) => key(q) + '_' + k))],
    ...r.people.map((person) => [...base(p, r, person), ...qs.flatMap((q) => { const v = value(q, look.get(person.id + '::' + q.id)); return [v.code, v.score, v.label, v.other, v.text] })])]
  throw Error('지원하지 않는 CSV 형식입니다.')
}
export const exportCsv = (p, r, format) => encode(rows(p, r, format))
