import { BIG5, attrLabel, districtName, regionName, tScore } from '../../lib/schema.js'
import { answerText, qLabel } from '../../lib/survey.js'

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
      return d ? districtName(d) : regionName(r) + ' 전체'
    })
  }
  if (key.startsWith('resp:') && ctx.run) {
    const q = ctx.run.survey.questions.find((x) => x.id === key.slice(5))
    return values.map((v) => answerText(q, Number(v)))
  }
  return values
}
function fieldLabel(key, ctx = {}) {
  if (key.startsWith('resp:') && ctx.run) {
    const q = ctx.run.survey.questions.find((x) => x.id === key.slice(5))
    return q ? qLabel(ctx.run.survey, q) : '응답'
  }
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
        return (
          <span className="fchip" key={key}>
            <b>{fieldLabel(key, ctx)}</b> {text}
            {onRemove ? (
              <button className="fchip-x" aria-label={`${fieldLabel(key, ctx)} 조건 해제`} onClick={() => onRemove(key)}>×</button>
            ) : null}
          </span>
        )
      })}
    </div>
  )
}
