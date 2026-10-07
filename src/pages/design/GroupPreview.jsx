import KoreaMap from '../../components/map/KoreaMap.jsx'
import { breakdown } from '../../lib/analysis.js'
import { ANALYSIS_KEYS, attrLabel, attrValue, BIG5, districtName } from '../../lib/schema.js'
import { useUiStore } from '../../store/useUiStore.js'
import { pct } from '../../utils/format.js'

/* 원본 groupPreview() */
export default function GroupPreview({ group, stale }) {
  const distKey = useUiStore((s) => s.distKey)
  const setResultsUi = useUiStore((s) => s.setResultsUi)

  const people = group.cohort.people
  const keys = [...Object.keys(group.filters).filter((k) => ANALYSIS_KEYS.includes(k)), 'age', 'sex', 'region', 'income_bracket']
  // 원본은 distKey가 유효하지 않으면 전역 변수를 직접 고쳐 썼지만, 여기서는 표시할 때만 기본값으로 대신하고
  // 사용자가 실제로 기준을 바꿀 때만 store에 쓴다(전환 규칙 2번 — 렌더링 중 상태를 스스로 보정하는 패턴 피하기).
  const effectiveDistKey = distKey && ANALYSIS_KEYS.includes(distKey) ? distKey : keys[0]
  const rows = breakdown(people, effectiveDistKey)
  const max = Math.max(...rows.map((r) => r.percent), 1)
  const traits = (p) => BIG5.filter((k) => /높음/.test(attrValue(p, k))).map((k) => attrLabel(k) + ' ' + attrValue(p, k)).slice(0, 2)

  return (
    <>
      <section className={`card ${stale ? 'dim' : ''}`}>
        <div className="card-top">
          <h2>분포 미리보기 · {people.length}명</h2>
          <label className="inline-sel">
            기준
            <select aria-label="분포 기준" value={effectiveDistKey} onChange={(ev) => setResultsUi({ distKey: ev.target.value })}>
              {ANALYSIS_KEYS.map((k) => <option key={k} value={k}>{attrLabel(k)}</option>)}
            </select>
          </label>
        </div>
        <div className={effectiveDistKey === 'region' ? 'dist-map' : ''}>
          {effectiveDistKey === 'region' ? <KoreaMap rows={rows} /> : null}
          <div className="dist">
            {rows.map((r) => (
              <div className="dist-row" key={r.value}>
                <span>{r.value}</span>
                <div className="track"><i style={{ width: `${(r.percent / max) * 100}%` }} /></div>
                <span className="num">{r.count}명 · {pct(r.percent)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className={`card ${stale ? 'dim' : ''}`}>
        <h2>프로필 미리보기</h2>
        <div className="people-grid">
          {people.slice(0, 6).map((p) => (
            <div className="mini" key={p.id}>
              <b>{p.id} · {attrValue(p, 'age')} {attrValue(p, 'sex')}</b>
              <span>{attrValue(p, 'region')} {districtName(p.attributes.district)}</span>
              <span>{p.attributes.occupation}</span>
              <span>소득 {attrValue(p, 'income_bracket')}</span>
              <div className="chips">{traits(p).map((t) => <span className="chip" key={t}>{t}</span>)}</div>
            </div>
          ))}
        </div>
        <p className="muted small-text">가상 시연 프로필입니다. 원자료 분포 비율대로 뽑았으며 실제 레코드를 추출한 것이 아닙니다.</p>
      </section>
    </>
  )
}
