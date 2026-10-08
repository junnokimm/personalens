import PERSONA_SCHEMA from '../data/personaSchema.json'
import { CONFIG } from './config'
import { hash, rng, uid } from './random'
import { attrLabel, field } from './schema'

const SCHEMA = () => PERSONA_SCHEMA

/* ---------- 대상 집단 (여러 개 저장) ---------- */
export function group(name = '새 대상 집단') { return { id: uid('group'), name, count: 100, filters: {}, cohort: null } }
export const groupKey = (g) => JSON.stringify({ count: g.count, filters: g.filters })
export const groupStale = (g) => !g.cohort || g.cohort.builtFrom !== groupKey(g)
export function groupError(g) {
  if (!Number.isInteger(g.count) || g.count < CONFIG.MIN_PERSONAS || g.count > CONFIG.MAX_PERSONAS) return `페르소나 수는 ${CONFIG.MIN_PERSONAS}~${CONFIG.MAX_PERSONAS}명으로 입력하세요.`
  return ''
}
export function weightedPicker(entries, rand) {
  const total = entries.reduce((a, e) => a + e.w, 0); const cum = []; let acc = 0
  for (const e of entries) { acc += e.w; cum.push(acc) }
  return () => { const x = rand() * total; let lo = 0, hi = cum.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < x) lo = m + 1; else hi = m } return entries[lo].v }
}
/* 시연용 집단 구성: 조건 안에서 원자료 분포(값별 인원) 비율대로 뽑습니다. 실제 레코드 추출이 아닙니다. */
export function buildCohort(g) {
  const err = groupError(g); if (err) throw Error(err)
  const rand = rng(hash(g.id + groupKey(g)))
  const pickers = {}
  for (const f of SCHEMA().fields) {
    if (f.type !== 'category' || f.key === 'region') continue
    const allowed = g.filters[f.key]?.length ? f.options.filter((o) => g.filters[f.key].includes(o.value)) : f.options
    pickers[f.key] = weightedPicker(allowed.map((o) => ({ v: o.value, w: o.count || 1 })), rand)
  }
  const sel = g.filters.region || []
  const districts = SCHEMA().regionDistricts.filter((d) => !sel.length || sel.includes(d.region) || sel.includes(d.region + '::' + d.district))
  const pickDistrict = weightedPicker(districts.map((d) => ({ v: d, w: d.count || 1 })), rand)
  const people = Array.from({ length: g.count }, (_, i) => {
    const attributes = { country: '대한민국' }
    for (const key of Object.keys(pickers)) attributes[key] = pickers[key]()
    const d = pickDistrict(); attributes.region = d.region; attributes.district = d.district
    for (const f of SCHEMA().fields) if (f.type === 'text') attributes[f.key] = ''
    return { id: 'P-' + String(i + 1).padStart(3, '0'), attributes }
  })
  const textFilters = Object.entries(g.filters).filter(([k, v]) => field(k)?.type === 'text' && v.length).map(([k]) => attrLabel(k))
  g.cohort = { builtFrom: groupKey(g), created: new Date().toISOString(), people, textFiltersIgnored: textFilters }
  return g.cohort
}
