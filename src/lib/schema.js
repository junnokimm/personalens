import PERSONA_SCHEMA from '../data/personaSchema.json'

const SCHEMA = () => PERSONA_SCHEMA

/* ---------- 스키마 속성 ---------- */
export const field = (key) => SCHEMA().fields.find((f) => f.key === key)
const REGION_NAMES = { '경상남': '경상남도', '경상북': '경상북도', '전라남': '전라남도', '충청남': '충청남도', '충청북': '충청북도' }
export const regionName = (v) => REGION_NAMES[v] || v
export const districtName = (d) => String(d).replace(/^[^-]+-/, '')
export const BIG5 = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism']
export const BIG5_LEVELS = ['매우 낮음', '낮음', '보통', '높음', '매우 높음']
export const tScore = (v) => { try { return JSON.parse(v).t_score } catch { return Number(v) } }
export const big5Level = (v) => { try { return JSON.parse(v).label } catch { return '' } }
export function big5Ranges(key) {
  const out = {}
  for (const o of field(key).options) { const t = tScore(o.value), l = big5Level(o.value); out[l] = out[l] ? [Math.min(out[l][0], t), Math.max(out[l][1], t)] : [t, t] }
  return BIG5_LEVELS.map((label) => ({ label, min: out[label][0], max: out[label][1] }))
}

/* 분석(집단 나누기·선택지 비교·페르소나 필터)에 함께 쓰는 속성 목록 — R-03 */
export const ANALYSIS_KEYS = ['sex', 'age', 'region', 'marital_status', 'education_level', 'economic_activity_status', 'income_bracket', 'housing_type', 'housing_tenure', 'bachelors_field', 'smoking_status', 'drinking_status', 'bmi_status', ...BIG5]
export const attrLabel = (key) => (key === 'region' ? '지역(시·도)' : field(key)?.label || key)
export function attrValue(person, key) {
  const v = person.attributes?.[key]
  if (v == null || v === '') return '정보 없음'
  if (BIG5.includes(key)) return big5Level(v) || '정보 없음'
  if (key === 'region') return regionName(v)
  return String(v)
}
const numKey = (v) => { if (/해당없음|정보 없음/.test(v)) return 1e9; const n = parseInt(v, 10); return isNaN(n) ? 1e8 : n - (/미만/.test(v) ? 0.5 : 0) }
export function valueOrder(key) {
  if (BIG5.includes(key)) return BIG5_LEVELS
  const opts = (field(key)?.options || []).map((o) => (key === 'region' ? regionName(o.value) : o.value))
  if (key === 'income_bracket' || key === 'age') return opts.slice().sort((a, b) => numKey(a) - numKey(b))
  return opts
}
export function sortValues(key, values) {
  const order = valueOrder(key)
  const idx = (v) => { const i = order.indexOf(v); return i < 0 ? 1e6 + numKey(v) : i }
  return values.slice().sort((a, b) => idx(a) - idx(b) || String(a).localeCompare(String(b), 'ko'))
}

/* 대상 조건(원자료 기준) 인원 추정 — 항목끼리 독립이라고 가정한 근사치 */
export function estimateCount(filters) {
  const total = SCHEMA().total; let ratio = 1, hasText = false
  for (const [key, values] of Object.entries(filters || {})) {
    if (!values?.length) continue
    const f = field(key); if (!f) continue
    if (f.type === 'text') { hasText = true; continue }
    let sum = 0
    if (key === 'region') {
      for (const v of values) {
        if (String(v).includes('::')) { const [r, d] = v.split('::'); sum += SCHEMA().regionDistricts.find((x) => x.region === r && x.district === d)?.count || 0 }
        else sum += f.options.find((o) => o.value === v)?.count || 0
      }
    } else sum = f.options.filter((o) => values.includes(o.value)).reduce((a, o) => a + o.count, 0)
    ratio *= sum / total
  }
  return { estimate: Math.round(total * ratio), total, hasText }
}
