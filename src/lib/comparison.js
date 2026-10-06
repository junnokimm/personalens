/* 선택지별 응답자 비교 — R-20 (계산부만. 화면부는 pages/results/ResponseComparison.jsx) */
import { CONFIG } from './config'
import { ANALYSIS_KEYS, attrValue, sortValues } from './schema'

export function compareRows(A, B, key) {
  const values = sortValues(key, [...new Set([...A, ...B].map((p) => attrValue(p, key)))])
  return values.map((value) => {
    const ca = A.filter((p) => attrValue(p, key) === value).length, cb = B.filter((p) => attrValue(p, key) === value).length
    const pa = A.length ? (ca / A.length) * 100 : 0, pb = B.length ? (cb / B.length) * 100 : 0
    return { value, ca, cb, pa, pb, gap: pa - pb, small: Math.max(ca, cb) < CONFIG.MIN_CELL }
  })
}
export function topAttributes(A, B) {
  return ANALYSIS_KEYS.map((key) => {
    const rows = compareRows(A, B, key).filter((r) => !r.small && !['정보 없음', '해당없음'].includes(r.value))
    const best = rows.sort((x, y) => Math.abs(y.gap) - Math.abs(x.gap))[0]
    return best ? { key, ...best } : null
  }).filter(Boolean).sort((x, y) => Math.abs(y.gap) - Math.abs(x.gap))
}
export const gapText = (g) => (Math.abs(g) < 0.05 ? '차이 없음' : `${g > 0 ? 'A' : 'B'}에서 ${Math.abs(g).toFixed(1)}%p 높음`)
