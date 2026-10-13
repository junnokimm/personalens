import { filterPeople } from '../../lib/analysis.js'
import { ANALYSIS_KEYS, attrValue } from '../../lib/schema.js'
import { choices } from '../../lib/survey.js'

const RESULT_KEYS = ['view', 'run', 'q', 'answer', 'attr', 'seg', 'persona', 'chatQ']
const RESULT_VIEWS = new Set(['overall', 'segment', 'personas', 'detail', 'chat', 'export'])

function fallbackQuestionId(run) {
  return run.survey.questions.find((question) => question.type !== 'text')?.id || run.survey.questions[0].id
}

function parseAnswer(question, value) {
  if (question.type === 'text' || value == null || value === '') return null
  const answer = Number(value)
  return Number.isInteger(answer) && answer >= 0 && answer < choices(question).length ? answer : null
}

function parseAttrs(run, question, answer, values) {
  if (answer === null) return []
  const responseFilter = { [`resp:${question.id}`]: [String(answer)] }
  let people = filterPeople(run, responseFilter)
  const attrs = []
  for (const raw of values) {
    const separator = raw.indexOf(':')
    if (separator < 1) continue
    const key = raw.slice(0, separator)
    const value = raw.slice(separator + 1)
    if (!ANALYSIS_KEYS.includes(key) || attrs.some((item) => item.key === key)) continue
    if (!people.some((person) => attrValue(person, key) === value)) continue
    attrs.push({ key, value })
    people = people.filter((person) => attrValue(person, key) === value)
  }
  return attrs
}

export function parseResultUrlState(run, searchParams) {
  const contextMatches = searchParams.get('run') === run.id
  const requestedQid = contextMatches ? searchParams.get('q') : null
  const qid = run.survey.questions.some((question) => question.id === requestedQid) ? requestedQid : fallbackQuestionId(run)
  const question = run.survey.questions.find((item) => item.id === qid)
  const answer = parseAnswer(question, contextMatches ? searchParams.get('answer') : null)
  const attrs = parseAttrs(run, question, answer, contextMatches ? searchParams.getAll('attr') : [])
  const availableKeys = ANALYSIS_KEYS.filter((key) => !attrs.some((item) => item.key === key))
  const requestedSegKey = contextMatches ? searchParams.get('seg') : null
  const segKey = availableKeys.includes(requestedSegKey) ? requestedSegKey : availableKeys[0] || ANALYSIS_KEYS[0]
  const requestedPersonaId = contextMatches ? searchParams.get('persona') : null
  const personaId = run.people.some((person) => person.id === requestedPersonaId) ? requestedPersonaId : null
  const requestedChatQid = contextMatches ? searchParams.get('chatQ') : null
  const chatQid = run.survey.questions.some((item) => item.id === requestedChatQid) ? requestedChatQid : qid
  const requestedView = searchParams.get('view') || 'overall'
  let view = RESULT_VIEWS.has(requestedView) ? requestedView : 'overall'
  if (view === 'segment' && answer === null) view = 'overall'
  if ((view === 'detail' || view === 'chat') && !personaId) view = 'personas'
  return { view, qid, drill: { answer, attrs }, segKey, personaId, chatQid }
}

function writeResultState(searchParams, state, runId) {
  const next = new URLSearchParams(searchParams)
  for (const key of RESULT_KEYS) next.delete(key)
  next.set('view', state.view)
  next.set('run', runId)
  next.set('q', state.qid)
  if (state.drill.answer !== null) next.set('answer', String(state.drill.answer))
  for (const attr of state.drill.attrs) next.append('attr', `${attr.key}:${attr.value}`)
  next.set('seg', state.segKey)
  if (state.personaId) next.set('persona', state.personaId)
  if (state.view === 'chat' && state.chatQid) next.set('chatQ', state.chatQid)
  return next
}

export function updateResultSearchParams(run, searchParams, changes) {
  const current = parseResultUrlState(run, searchParams)
  const requested = {
    ...current,
    ...changes,
    drill: changes.drill ?? current.drill,
  }
  const provisional = writeResultState(searchParams, requested, run.id)
  return writeResultState(searchParams, parseResultUrlState(run, provisional), run.id)
}

export function drillFilters(qid, drill) {
  const filters = drill.answer !== null ? { [`resp:${qid}`]: [String(drill.answer)] } : {}
  for (const attr of drill.attrs) filters[attr.key] = [attr.value]
  return filters
}
