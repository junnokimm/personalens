import { clone, hash, rng, uid } from './random'
import { attrValue } from './schema'
import { choices, isOther, lockVersion, ordered, surveyError } from './survey'
import { groupStale } from './cohort'

/* ---------- 실행 ---------- */
const DRIVERS = ['age', 'sex', 'income_bracket', 'openness', 'extraversion', 'economic_activity_status', 'region']
/* 시연용 응답 생성: 문항마다 2~3개 속성에 따라 선택 확률이 조금씩 달라지게 만든 가짜 응답입니다. */
export function generate(q, person, seed, parentAnswer, parentQ) {
  const n = choices(q).length, rand = rng(hash(seed + person.id + q.id))
  const drivers = DRIVERS.filter((k) => hash(q.id + k) % 3 === 0).slice(0, 3)
  const logits = Array.from({ length: n }, (_, i) => {
    let s = 0
    for (const k of drivers) s += ((hash(q.id + k + attrValue(person, k) + i) % 1000) / 1000 - 0.5) * 0.7
    if (q.type === 'likert') s += -Math.pow((i - (n - 1) * 0.55) / n, 2) * 3
    if (parentQ && Number.isInteger(parentAnswer)) {
      const pn = choices(parentQ).length
      s += ((hash(q.id + 'p' + parentAnswer + i) % 1000) / 1000 - 0.5) * 2 + (q.type === 'likert' ? -Math.abs(i / (n - 1 || 1) - parentAnswer / (pn - 1 || 1)) * 3 : 0)
    }
    return s
  })
  const w = logits.map((x) => Math.exp(x)), t = w.reduce((a, b) => a + b, 0)
  let x = rand() * t, i = 0; while (i < n - 1 && (x -= w[i]) > 0) i++
  return i
}
export function textAnswer(q, person) {
  return `${attrValue(person, 'age')} ${attrValue(person, 'sex')}, ${person.attributes.occupation || '직업 정보 없음'}입니다. ` +
    `“${q.text}”에 대해서는 ${attrValue(person, 'income_bracket')} 소득 수준과 개방성 ${attrValue(person, 'openness')} 성향을 고려해 답하겠습니다.`
}
export function createRun(p, g) {
  if (surveyError(p.survey)) throw Error(surveyError(p.survey))
  if (groupStale(g)) throw Error(`대상 집단 "${g.name}"을 현재 조건으로 먼저 구성하세요.`)
  const version = lockVersion(p.survey)
  const survey = { title: p.survey.title, description: p.survey.description, version, questions: ordered(p.survey).map(clone) }
  const seed = hash(p.id + version + g.id + g.cohort.created)
  const people = clone(g.cohort.people), responses = []
  for (const person of people) {
    const given = {}
    for (const q of survey.questions) {
      if (q.type === 'text') { responses.push({ personaId: person.id, questionId: q.id, answer: null, text: textAnswer(q, person) }); continue }
      const parent = q.parentId ? survey.questions.find((x) => x.id === q.parentId) : null
      const answer = generate(q, person, seed, parent ? given[parent.id] : null, parent)
      given[q.id] = answer
      responses.push({ personaId: person.id, questionId: q.id, answer, otherText: isOther(q, answer) ? `${attrValue(person, 'age')} ${attrValue(person, 'sex')} 입장에서 원하는 다른 방식이 있습니다.` : '' })
    }
  }
  return {
    id: uid('run'), number: (p.runs.reduce((m, r) => Math.max(m, r.number || 0), 0) + 1), created: new Date().toISOString(),
    status: 'running', progress: 0, survey, groupId: g.id, groupName: g.name, groupConfig: { count: g.count, filters: clone(g.filters) },
    people, responses, engine: { name: '시연 생성기', version: '3', seed },
  }
}
