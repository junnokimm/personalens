/* 원본(legacy/*.js)과 src/lib/* 계산 결과가 같은지 확인하는 회귀 테스트.
 * 원본은 node:vm으로 그대로 불러와 context.PS / context.PSCSV / context.compareRows 등을 얻는다.
 * uid()가 Date.now()/Math.random()을 쓰기 때문에, 비교용 fixture는 프로젝트·문항·집단 ID를
 * 고정 문자열로 직접 만들고, buildCohort 직후 cohort.created / createRun 직후 run.id·run.created를
 * 고정값으로 덮어써서 양쪽에 같은 입력이 들어가게 한다. */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

import personaSchema from '../src/data/personaSchema.json'

import { CONFIG } from '../src/lib/config.js'
import { attrValue, estimateCount, field } from '../src/lib/schema.js'
import { choices, lockVersion, validateSurvey } from '../src/lib/survey.js'
import { buildCohort } from '../src/lib/cohort.js'
import { createRun } from '../src/lib/simulation.js'
import { breakdown, distribution, filterPeople, responseStats } from '../src/lib/analysis.js'
import { compareRows, topAttributes } from '../src/lib/comparison.js'
import { exportCsv } from '../src/lib/csv.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LEGACY_DIR = path.resolve(__dirname, '../legacy')

function loadLegacy() {
  const context = { console }
  vm.createContext(context)
  for (const file of ['persona-schema.js', 'core.js', 'csv.js', 'comparison.js']) {
    vm.runInContext(readFileSync(path.join(LEGACY_DIR, file), 'utf8'), context, { filename: file })
  }
  return context
}
const legacy = loadLegacy()

const FIXED_TIME = '2026-01-01T00:00:00.000Z'
const FIXED_RUN_ID = 'run-fixed'

/* ---------- fixtures ---------- */
/* (a) 원본 sample()과 같은 구성: 후속 질문(likert → choice) 포함 */
function fixtureA() {
  const survey = {
    title: '일상 속 디지털 구독 서비스',
    description: '구독 서비스의 이용 의향과 선택 기준을 탐색하기 위한 예시 조사입니다.',
    version: 0, draft: true, history: [],
    questions: [
      { id: 'qa-1', type: 'likert', parentId: null, text: '나에게 맞는 콘텐츠를 추천해 주는 구독 서비스를 이용하고 싶다.', options: [], otherEnabled: false, scale: 5, low: '전혀 동의하지 않음', high: '매우 동의함' },
      { id: 'qa-1b', type: 'choice', parentId: 'qa-1', text: '방금 그렇게 답한 가장 큰 이유는 무엇인가요?', options: ['시간을 아낄 수 있어서', '새로운 콘텐츠를 찾고 싶어서', '추천을 믿기 어려워서', '개인정보가 걱정돼서'], otherEnabled: false, scale: 5, low: '전혀 그렇지 않다', high: '매우 그렇다' },
      { id: 'qa-2', type: 'choice', parentId: null, text: '구독 서비스를 선택할 때 가장 중요하게 보는 요소는 무엇인가요?', options: ['가격', '콘텐츠의 다양성', '개인 맞춤 추천', '이용 편의성'], otherEnabled: false, scale: 5, low: '전혀 그렇지 않다', high: '매우 그렇다' },
      { id: 'qa-3', type: 'choice', parentId: null, text: '새로운 서비스를 어떤 방식으로 경험하고 싶나요?', options: ['무료 체험', '월간 구독', '필요할 때 단건 결제'], otherEnabled: true, scale: 5, low: '전혀 그렇지 않다', high: '매우 그렇다' },
    ],
  }
  const group = { id: 'group-a', name: '기본 집단', count: 120, filters: { age: ['20대', '30대', '40대', '50대', '60대'] }, cohort: null }
  const project = { id: 'project-a', name: '구독 서비스 이용 경험 조사', description: '새로운 구독 서비스를 기획하기 전에 이용자의 기대와 선택 기준을 살펴봅니다.', updated: FIXED_TIME, survey, groups: [group], activeGroupId: group.id, runs: [], chats: {} }
  return { project, group, survey }
}

/* (b) 지역·연령·Big5(openness) 조건이 걸린 집단 */
const OPENNESS_MID_VALUES = personaSchema.fields.find((f) => f.key === 'openness').options
  .filter((o) => { const t = JSON.parse(o.value).t_score; return t >= 40 && t <= 55 })
  .map((o) => o.value)
function fixtureB() {
  const survey = {
    title: '동네 생활 서비스 이용 조사',
    description: '지역 조건에 따른 응답 차이를 보는 예시 조사입니다.',
    version: 0, draft: true, history: [],
    questions: [
      { id: 'qb-1', type: 'choice', parentId: null, text: '동네 생활 서비스를 알게 된 경로는 무엇인가요?', options: ['지인 추천', '온라인 광고', '커뮤니티 글'], otherEnabled: false, scale: 5, low: '전혀 그렇지 않다', high: '매우 그렇다' },
      { id: 'qb-2', type: 'likert', parentId: null, text: '동네 생활 서비스를 꾸준히 이용할 것이다.', options: [], otherEnabled: false, scale: 5, low: '전혀 동의하지 않음', high: '매우 동의함' },
    ],
  }
  const group = { id: 'group-b', name: '수도권 2030 · 개방성 중간', count: 60, filters: { region: ['서울', '경기', '인천'], age: ['20대', '30대'], openness: OPENNESS_MID_VALUES }, cohort: null }
  const project = { id: 'project-b', name: '동네 생활 서비스 조사', description: '지역 생활 서비스 조사', updated: FIXED_TIME, survey, groups: [group], activeGroupId: group.id, runs: [], chats: {} }
  return { project, group, survey }
}

/* (c) 주관식 문항과 '기타' 선택지가 있는 설문 */
function fixtureC() {
  const survey = {
    title: '아침 식사 습관 조사',
    description: '아침 식사와 관련된 습관을 알아봅니다.',
    version: 0, draft: true, history: [],
    questions: [
      { id: 'qc-1', type: 'text', parentId: null, text: '아침 식사를 거르는 이유를 자유롭게 적어주세요.', options: [], otherEnabled: false, scale: 5, low: '전혀 그렇지 않다', high: '매우 그렇다' },
      { id: 'qc-2', type: 'choice', parentId: null, text: '아침 식사로 가장 자주 먹는 음식은 무엇인가요?', options: ['빵', '밥', '시리얼'], otherEnabled: true, scale: 5, low: '전혀 그렇지 않다', high: '매우 그렇다' },
    ],
  }
  const group = { id: 'group-c', name: '여성 응답자', count: 40, filters: { sex: ['여자'] }, cohort: null }
  const project = { id: 'project-c', name: '아침 식사 습관 조사', description: '아침 식사 습관 조사', updated: FIXED_TIME, survey, groups: [group], activeGroupId: group.id, runs: [], chats: {} }
  return { project, group, survey }
}

const FIXTURES = [['(a) sample 구성', fixtureA], ['(b) 지역·연령·Big5 조건', fixtureB], ['(c) 주관식·기타 선택지', fixtureC]]

/* ---------- 두 구현에서 같은 fixture로 cohort·run 만들기 ---------- */
function buildLegacy({ project, group }) {
  const cohort = legacy.PS.buildCohort(group)
  cohort.created = FIXED_TIME
  const run = legacy.PS.createRun(project, group)
  run.id = FIXED_RUN_ID
  run.created = FIXED_TIME
  return { project, group, run }
}
function buildNew({ project, group }) {
  const cohort = buildCohort(group)
  cohort.created = FIXED_TIME
  const run = createRun(project, group)
  run.id = FIXED_RUN_ID
  run.created = FIXED_TIME
  return { project, group, run }
}

describe('legacy-parity', () => {
  describe.each(FIXTURES)('%s', (_label, makeFixture) => {
    const legacyResult = buildLegacy(makeFixture())
    const newResult = buildNew(makeFixture())

    it('buildCohort의 people이 같다', () => {
      expect(newResult.group.cohort.people).toEqual(legacyResult.group.cohort.people)
      expect(newResult.group.cohort.builtFrom).toEqual(legacyResult.group.cohort.builtFrom)
      expect(newResult.group.cohort.textFiltersIgnored).toEqual(legacyResult.group.cohort.textFiltersIgnored)
    })

    it('createRun의 people, responses, engine.seed, survey가 같다', () => {
      expect(newResult.run.people).toEqual(legacyResult.run.people)
      expect(newResult.run.responses).toEqual(legacyResult.run.responses)
      expect(newResult.run.engine.seed).toEqual(legacyResult.run.engine.seed)
      expect(newResult.run.survey).toEqual(legacyResult.run.survey)
    })

    it('distribution, responseStats가 같다', () => {
      for (const q of newResult.run.survey.questions) {
        if (q.type === 'text') continue
        expect(distribution(newResult.run, q.id)).toEqual(legacy.PS.distribution(legacyResult.run, q.id))
        expect(responseStats(newResult.run, q.id)).toEqual(legacy.PS.responseStats(legacyResult.run, q.id))
      }
    })

    it('breakdown이 같다', () => {
      for (const key of ['age', 'sex', 'region', 'openness']) {
        expect(breakdown(newResult.run.people, key)).toEqual(legacy.PS.breakdown(legacyResult.run.people, key))
      }
    })

    it('filterPeople이 같다', () => {
      const firstQ = newResult.run.survey.questions[0]
      const filterSets = [{ sex: ['남자'] }, { age: ['20대', '30대'] }, { ['resp:' + firstQ.id]: ['0'] }]
      for (const filters of filterSets) {
        expect(filterPeople(newResult.run, filters)).toEqual(legacy.PS.filterPeople(legacyResult.run, filters))
      }
    })

    it('estimateCount가 같다', () => {
      expect(estimateCount(newResult.group.filters)).toEqual(legacy.PS.estimateCount(legacyResult.group.filters))
    })

    it('compareRows, topAttributes가 같다', () => {
      const newA = filterPeople(newResult.run, { sex: ['남자'] }), newB = filterPeople(newResult.run, { sex: ['여자'] })
      const legacyA = legacy.PS.filterPeople(legacyResult.run, { sex: ['남자'] }), legacyB = legacy.PS.filterPeople(legacyResult.run, { sex: ['여자'] })
      for (const key of ['age', 'region', 'openness', 'income_bracket']) {
        expect(compareRows(newA, newB, key)).toEqual(legacy.compareRows(legacyA, legacyB, key))
      }
      expect(topAttributes(newA, newB)).toEqual(legacy.topAttributes(legacyA, legacyB))
    })

    it('exportCsv의 wide, long, codebook이 같다', () => {
      for (const format of ['wide', 'long', 'codebook']) {
        const newCsv = exportCsv(newResult.project, newResult.run, format)
        const legacyCsv = legacy.PSCSV.exportCsv(legacyResult.project, legacyResult.run, format)
        expect(newCsv).toEqual(legacyCsv)
      }
    })
  })

  describe('validateSurvey, lockVersion 이후 survey 상태가 같다', () => {
    for (const [label, makeFixture] of FIXTURES) {
      it(label, () => {
        const newSurvey = makeFixture().survey
        const legacySurvey = makeFixture().survey

        expect(validateSurvey(newSurvey)).toEqual(legacy.PS.validateSurvey(legacySurvey))

        lockVersion(newSurvey)
        legacy.PS.lockVersion(legacySurvey)
        const stripCreated = (s) => ({ ...s, history: s.history.map(({ created, ...rest }) => rest) })
        expect(stripCreated(newSurvey)).toEqual(stripCreated(legacySurvey))
      })
    }
  })

  it('CONFIG, choices, attrValue, field이 같다', () => {
    expect(CONFIG).toEqual(legacy.PS.CONFIG)
    const q = { id: 'q-x', type: 'likert', parentId: null, text: '질문', options: [], otherEnabled: false, scale: 5, low: '낮음', high: '높음' }
    expect(choices(q)).toEqual(legacy.PS.choices(q))
    const person = { id: 'P-001', attributes: { age: '30대', sex: '여자', region: '서울' } }
    expect(attrValue(person, 'age')).toEqual(legacy.PS.attrValue(person, 'age'))
    expect(field('age')).toEqual(legacy.PS.field('age'))
  })
})
