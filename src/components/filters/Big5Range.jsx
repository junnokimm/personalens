import { big5Ranges, field, tScore } from '../../lib/schema.js'

/* 원본 fmBig5Html() — Big5 5단계 버튼 + 20~80점 범위 슬라이더.
 * 슬라이더는 끄는 동안(onRangeChange)은 숫자·조건만 갱신하고 되돌리기 기록을 남기지 않는다(원본 fmBig5Soft).
 * 단계 버튼(onLevelClick)은 같은 구간을 다시 누르면 해제하고, 되돌리기 기록을 남긴다(원본 fmBig5). */
export default function Big5Range({ fieldKey, definition = field(fieldKey), selected, onLevelClick, onRangeChange }) {
  const ranges = big5Ranges(fieldKey, definition)
  const t = selected.map(tScore)
  const lo = t.length ? Math.min(...t) : 20
  const hi = t.length ? Math.max(...t) : 80
  const count = definition.options.filter((o) => { const s = tScore(o.value); return s >= lo && s <= hi }).reduce((a, o) => a + o.count, 0)

  function handleRange(which, value) {
    if (which === 'lo') onRangeChange(Math.min(value, hi), hi)
    else onRangeChange(lo, Math.max(value, lo))
  }

  return (
    <>
      <p className="muted small-text">T점수(20~80점) 범위로 고릅니다. 단계 버튼을 누르면 해당 구간이 바로 선택됩니다.</p>
      <div className="levels">
        {ranges.map((r) => (
          <button key={r.label} className={`small ${t.length && r.min >= lo && r.max <= hi ? 'on' : ''}`} onClick={() => onLevelClick(r.min, r.max)}>
            {r.label}<small>{r.min}~{r.max}</small>
          </button>
        ))}
      </div>
      <div className="range-box" aria-label="점수 범위">
        <div className="range-vals"><span>최소 <b>{lo}</b>점</span><span>최대 <b>{hi}</b>점</span></div>
        <div className="dual-range">
          <div className="dual-range-track" />
          <div className="dual-range-fill" style={{ left: `${((lo - 20) / 60) * 100}%`, right: `${100 - ((hi - 20) / 60) * 100}%` }} />
          <label className="sr-only" htmlFor="fm-lo">최소 점수</label>
          <input id="fm-lo" type="range" min={20} max={hi} value={lo} onChange={(ev) => handleRange('lo', Number(ev.target.value))} />
          <label className="sr-only" htmlFor="fm-hi">최대 점수</label>
          <input id="fm-hi" type="range" min={lo} max={80} value={hi} onChange={(ev) => handleRange('hi', Number(ev.target.value))} />
        </div>
      </div>
      <p className="small-text">{t.length ? `${lo}~${hi}점 · 원자료 중 ${count.toLocaleString()}명` : '아직 범위를 고르지 않았습니다. 전체 점수가 포함됩니다.'}</p>
    </>
  )
}
