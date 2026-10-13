import { BIG5, attrLabel, districtName, tScore } from '../../lib/schema.js'
import { answerText, qLabel } from '../../lib/survey.js'
import { displayRegion } from '../../utils/format.js'

/* 원본 conditions.js의 valueText/fieldLabel — 조건 칩에 표시할 값·이름 */
function valueText(key, values, ctx = {}) {
  const mode = ctx.mode || 'target'
  if (mode === 'target' && BIG5.includes(key)) {
    const t = values.map(tScore)
    return Math.min(...t) + '~' + Math.max(...t) + '점'
  }
  if (mode === 'target' && key === 'region') {
    return values.map((v) => {
      const [r, d] = String(v).split('::')
      return d ? districtName(d) : displayRegion(r) + ' 전체'
    })
  }
  if (key.startsWith('resp:') && ctx.run) {
    const q = ctx.run.survey.questions.find((x) => x.id === key.slice(5))
    return values.map((v) => answerText(q, Number(v)))
  }
  return values
}
/* 지역 조건에 시·군·구가 하나라도 섞여 있으면 "지역(시·도)" 대신 "지역"으로 — 값이 시·도보다 더 좁기 때문 */
function fieldLabel(key, values, ctx = {}) {
  if (key.startsWith('resp:') && ctx.run) {
    const q = ctx.run.survey.questions.find((x) => x.id === key.slice(5))
    return q ? qLabel(ctx.run.survey, q) : '응답'
  }
  if (key === 'region' && values.some((v) => String(v).includes('::'))) return '지역'
  return attrLabel(key)
}

/* 조건 칩 — 요약·대상 집단·시뮬레이션·페르소나 목록 화면에서 공유 */
export default function FilterChips({ filters, ctx = {}, onRemove }) {
  const entries = Object.entries(filters || {}).filter(([, v]) => v?.length)
  if (!entries.length) return <p className="muted small-text">{ctx.empty || '조건 없음 · 한국인 전체에서 구성'}</p>
  return (
    <div className="chips">
      {entries.map(([key, values]) => {
        const v = valueText(key, values, ctx)
        const list = Array.isArray(v) ? v : [v]
        const text = list.slice(0, 3).join(', ') + (list.length > 3 ? ` 외 ${list.length - 3}개` : '')
        const label = fieldLabel(key, values, ctx)
        return (
          <span className="fchip" key={key}>
            <b>{label}</b> {text}
            {onRemove ? (
              <button className="fchip-x" aria-label={`${label} 조건 해제`} onClick={() => onRemove(key)}>×</button>
            ) : null}
          </span>
        )
      })}
    </div>
  )
}
