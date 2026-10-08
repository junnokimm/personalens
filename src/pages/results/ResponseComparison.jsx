import PairBars from '../../components/charts/PairBars.jsx'
import Banner from '../../components/common/Banner.jsx'
import { compareRows, gapText, topAttributes } from '../../lib/comparison.js'
import { CONFIG } from '../../lib/config.js'
import { distribution, filterPeople } from '../../lib/analysis.js'
import { ANALYSIS_KEYS, attrLabel } from '../../lib/schema.js'
import { choices } from '../../lib/survey.js'
import { useUiStore } from '../../store/useUiStore.js'

const LIMIT = 8

function GapBadge({ gap }) {
  return (
    <span className={`gap ${Math.abs(gap) >= CONFIG.HIGHLIGHT_PP ? 'strong' : ''} ${gap >= 0 ? 'ga' : 'gb'}`}>
      {gap >= 0 ? '+' : '−'}{Math.abs(gap).toFixed(1)}%p
    </span>
  )
}

/* 원본 comparison.js의 responseComparison() — 선택지별 응답자 비교.
 * CMP는 원본처럼 문항이 바뀌면 다시 계산되지만, 렌더링 중에 전역을 직접 고치지 않고
 * 표시할 때만 기본값을 계산해 쓰고 사용자가 실제로 고를 때만 store에 쓴다(전환 규칙 2번). */
export default function ResponseComparison({ run, q }) {
  const key = run.id + ':' + q.id
  const cmp = useUiStore((s) => s.cmp)
  const setResultsUi = useUiStore((s) => s.setResultsUi)
  const labels = choices(q)

  let effectiveCmp = cmp
  if (cmp.key !== key) {
    const dist = distribution(run, q.id).map((d, i) => ({ i, c: d.count })).sort((x, y) => y.c - x.c)
    effectiveCmp = { key, a: dist[0]?.i ?? 0, b: dist[1]?.i ?? 1, attr: '', showAll: false }
  }
  const { a, b, showAll } = effectiveCmp

  const A = filterPeople(run, { ['resp:' + q.id]: [String(a)] })
  const B = filterPeople(run, { ['resp:' + q.id]: [String(b)] })
  const total = run.people.length

  function updatePick(which, value) {
    setResultsUi({ cmp: { ...effectiveCmp, [which]: value, attr: '', showAll: false } })
  }
  function pickAttr(k) {
    setResultsUi({ cmp: { ...effectiveCmp, attr: k, showAll: false } })
  }

  const pickSelect = (id, which, other) => (
    <label className={`cmp-pick ${which}`} key={which}>
      <span>{which === 'a' ? 'A' : 'B'}</span>
      <select id={id} aria-label={`비교 집단 ${which.toUpperCase()}`} value={effectiveCmp[which]} onChange={(ev) => updatePick(which, Number(ev.target.value))}>
        {labels.map((l, i) => (
          <option key={i} value={i} disabled={i === other}>{l} ({filterPeople(run, { ['resp:' + q.id]: [String(i)] }).length}명)</option>
        ))}
      </select>
    </label>
  )

  const headContent = (
    <>
      <div className="card-top"><div><h2>선택지별 응답자 비교</h2><p className="muted small-text">두 선택지를 고른 사람들이 어떤 속성에서 다른지 보여 줍니다. 합성 응답 기준입니다.</p></div></div>
      <div className="cmp-picks">{pickSelect('cmp-a', 'a', b)}{pickSelect('cmp-b', 'b', a)}</div>
      <div className="cmp-sizes">
        <div className="size a"><b>A · {A.length}명</b><span>전체 {total}명 중 {(A.length / total * 100).toFixed(1)}%</span></div>
        <div className="size b"><b>B · {B.length}명</b><span>전체 {total}명 중 {(B.length / total * 100).toFixed(1)}%</span></div>
      </div>
    </>
  )

  if (!A.length || !B.length) {
    return (
      <section className="card cmp">
        {headContent}
        <p className="empty">응답자가 없는 선택지가 있어 비교할 수 없습니다.</p>
      </section>
    )
  }

  const warn = A.length < CONFIG.MIN_GROUP || B.length < CONFIG.MIN_GROUP
    ? <Banner tone="warn">비교 집단이 {CONFIG.MIN_GROUP}명 미만입니다. 차이는 참고용으로만 보세요. {CONFIG.MIN_CELL}명 미만인 구간은 흐리게 표시하고 순위 계산에서 뺍니다.</Banner>
    : null

  const tops = topAttributes(A, B)
  const top3 = tops.slice(0, 3)
  const effectiveAttr = effectiveCmp.attr || top3[0]?.key || 'age'

  const cards = top3.length ? (
    <>
      <h3 className="sub-h">차이가 큰 속성 {top3.length}개 <small>분석용 속성 {ANALYSIS_KEYS.length}개 중</small></h3>
      <div className="top3">
        {top3.map((t) => (
          <button key={t.key} className={`top-card ${effectiveAttr === t.key ? 'on' : ''}`} onClick={() => pickAttr(t.key)}>
            <span className="t-head"><b>{attrLabel(t.key)}</b><GapBadge gap={t.gap} /></span>
            <span className="t-line">{t.value} 비율이 {gapText(t.gap)}</span>
            <span className="t-bars"><span className="lab">A</span><div className="pair"><i className="pa" style={{ width: `${t.pa}%` }} /></div><span className="num">{t.pa.toFixed(1)}%</span></span>
            <span className="t-bars"><span className="lab">B</span><div className="pair"><i className="pb" style={{ width: `${t.pb}%` }} /></div><span className="num">{t.pb.toFixed(1)}%</span></span>
          </button>
        ))}
      </div>
    </>
  ) : <p className="muted">표본 기준을 넘는 구간이 없어 차이 순위를 계산하지 않았습니다.</p>

  const rows = compareRows(A, B, effectiveAttr)
  let shown = rows
  if (!showAll && rows.length > LIMIT) {
    const big = rows.filter((x) => !x.small)
    const keep = new Set((big.length > LIMIT ? big.slice().sort((x, y) => Math.abs(y.gap) - Math.abs(x.gap)).slice(0, LIMIT) : big).map((x) => x.value))
    shown = rows.filter((x) => keep.has(x.value))
  }

  const chart = (
    <div className="cmp-detail">
      <div className="cmp-detail-head">
        <label htmlFor="cmp-attr">속성 직접 고르기</label>
        <select id="cmp-attr" value={effectiveAttr} onChange={(ev) => pickAttr(ev.target.value)}>
          {ANALYSIS_KEYS.map((k) => <option key={k} value={k}>{attrLabel(k)}</option>)}
        </select>
        <span className="legend"><i className="pa" /> A <i className="pb" /> B</span>
      </div>
      <div className="cmp-rows">
        {shown.map((x) => (
          <div className={`cmp-row ${x.small ? 'small' : ''}`} key={x.value}>
            <span className="v">{x.value}</span>
            <span className="bars"><PairBars aPercent={x.pa} bPercent={x.pb} /></span>
            <span className="n">A {x.pa.toFixed(1)}% <small>({x.ca})</small> · B {x.pb.toFixed(1)}% <small>({x.cb})</small></span>
            <span className="g">{x.small ? <span className="tag">표본 적음</span> : <GapBadge gap={x.gap} />}</span>
          </div>
        ))}
      </div>
      {rows.length > shown.length ? (
        <button className="link" onClick={() => setResultsUi({ cmp: { ...effectiveCmp, attr: effectiveAttr, showAll: true } })}>표본이 적은 구간 포함 전체 {rows.length}개 구간 보기</button>
      ) : showAll && rows.length > LIMIT ? (
        <button className="link" onClick={() => setResultsUi({ cmp: { ...effectiveCmp, attr: effectiveAttr, showAll: false } })}>차이가 큰 구간만 보기</button>
      ) : null}
    </div>
  )

  return (
    <section className="card cmp">
      {headContent}
      {warn}
      {cards}
      {chart}
      <p className="muted small-text foot-note">기준: 구간 인원 {CONFIG.MIN_CELL}명 미만은 순위에서 제외 · {CONFIG.HIGHLIGHT_PP}%p 이상 차이는 진하게 표시 · 차이는 두 집단 안의 비율 차이(%p)입니다.</p>
    </section>
  )
}
