import { useSearchParams } from 'react-router-dom'

import PairBars from '../../components/charts/PairBars.jsx'
import SegGap from '../../components/charts/SegGap.jsx'
import { filterPeople, distribution } from '../../lib/analysis.js'
import { CONFIG } from '../../lib/config.js'
import { ANALYSIS_KEYS, attrLabel, attrValue, sortValues } from '../../lib/schema.js'
import { answerText, qLabel } from '../../lib/survey.js'
import { useUiStore } from '../../store/useUiStore.js'
import { pct } from '../../utils/format.js'
import Trail from './Trail.jsx'

const shade = (q, i) => (q.type === 'likert' ? 's' + (Math.round((i / (q.scale - 1)) * 4) + 1) : 'sc')

/* 원본 segmentView()/startSegment()/drillFilters()/narrow()/toPersonas() */
export default function SegmentView({ run }) {
  const [, setSearchParams] = useSearchParams()
  const qid = useUiStore((s) => s.qid)
  const drill = useUiStore((s) => s.drill)
  const segKey = useUiStore((s) => s.segKey)
  const segMode = useUiStore((s) => s.segMode)
  const setResultsUi = useUiStore((s) => s.setResultsUi)

  const effectiveQid = qid && run.survey.questions.some((x) => x.id === qid)
    ? qid
    : (run.survey.questions.find((x) => x.type !== 'text')?.id || run.survey.questions[0].id)
  const q = run.survey.questions.find((x) => x.id === effectiveQid)
  const dist = distribution(run, q.id)

  const drillFilters = () => {
    const f = drill.answer !== null ? { ['resp:' + q.id]: [String(drill.answer)] } : {}
    for (const a of drill.attrs) f[a.key] = [a.value]
    return f
  }
  const people = filterPeople(run, drillFilters())
  const baseF = {}
  for (const a of drill.attrs) baseF[a.key] = [a.value]
  const base = filterPeople(run, baseF)
  const answerGroup = filterPeople(run, { ['resp:' + q.id]: [String(drill.answer)] })

  const avail = ANALYSIS_KEYS.filter((k) => !drill.attrs.some((a) => a.key === k))
  const effectiveSegKey = avail.includes(segKey) ? segKey : avail[0]
  const small = people.length < CONFIG.MIN_GROUP
  const values = sortValues(effectiveSegKey, [...new Set([...people, ...base].map((p) => attrValue(p, effectiveSegKey)))])
  const rows = values.map((v) => {
    const c = people.filter((p) => attrValue(p, effectiveSegKey) === v).length
    const bc = base.filter((p) => attrValue(p, effectiveSegKey) === v).length
    const pa = people.length ? c / people.length * 100 : 0
    const pb = base.length ? bc / base.length * 100 : 0
    return { v, c, bc, pa, pb, gap: pa - pb }
  })
  const effectiveSegMode = segMode === 'map' ? 'table' : segMode
  const baseDesc = drill.attrs.length
    ? `${drill.attrs.map((a) => attrLabel(a.key) + ' ' + a.value).join(', ')} 전체 (${qLabel(run.survey, q)} 응답과 관계없이)`
    : '전체 응답자'

  function resetDrill() {
    setResultsUi({ drill: { answer: null, attrs: [] } })
    setSearchParams({ view: 'overall' })
  }
  function trimAttrs(n) {
    setResultsUi({ drill: { ...drill, attrs: drill.attrs.slice(0, n) } })
  }
  function startSegment(i) {
    setResultsUi({ drill: { answer: i, attrs: [] }, segKey: ANALYSIS_KEYS[0] })
  }
  function narrow(value) {
    setResultsUi({ drill: { ...drill, attrs: [...drill.attrs, { key: effectiveSegKey, value }] } })
  }
  function toPersonas() {
    setResultsUi({ pf: drillFilters(), pSearch: '', pPage: 0, respCol: q.id })
    setSearchParams({ view: 'personas' })
  }
  function changeSegKey(key) {
    setResultsUi({ segKey: key, segMode: key === 'region' ? 'map' : effectiveSegMode === 'map' ? 'table' : effectiveSegMode })
  }

  const strip = (
    <div className="whole">
      <p className="small-text muted">{qLabel(run.survey, q)} 전체 응답 분포 · 다른 응답을 누르면 기준이 바뀝니다</p>
      <div className="stack">
        {dist.map((d, i) => d.count ? (
          <button key={i} className={`${shade(q, i)} ${i === drill.answer ? 'on' : ''}`} style={{ flex: d.count }} title={`${d.label} ${pct(d.percent)}`} onClick={() => startSegment(i)}>
            <span>{q.type === 'likert' ? i + 1 + '점' : d.label}</span><b>{pct(d.percent)}</b>
          </button>
        ) : null)}
      </div>
    </div>
  )

  const table = (
    <div className="table-wrap">
      <table className="seg-table">
        <thead><tr><th>{attrLabel(effectiveSegKey)}</th><th>이 집단 ({people.length}명)</th><th>비교 기준 ({base.length}명)</th><th className="w-bars">비교</th><th>차이</th><th></th></tr></thead>
        <tbody>
          {rows.map((x) => {
            const c = Math.round(x.pa * people.length / 100)
            return (
              <tr key={x.v} className={c < CONFIG.MIN_CELL ? 'thin' : ''}>
                <td>{x.v}</td>
                <td><b>{c}명</b> · {pct(x.pa)}</td>
                <td>{pct(x.pb)}</td>
                <td><PairBars aPercent={x.pa} bPercent={x.pb} bClassName="pbase" /></td>
                <td><SegGap gap={x.gap} small={c < CONFIG.MIN_CELL} /></td>
                <td className="right">{c ? <button className="small" onClick={() => narrow(x.v)}>좁히기</button> : null}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  const chart = (
    <div className="seg-chart">
      {rows.map((x) => (
        <div className="seg-bar" key={x.v}>
          <span className="v">{x.v}</span>
          <div className="track wide"><i className="pa" style={{ width: `${x.pa}%` }} /><em className="marker" style={{ left: `${x.pb}%` }} title={`비교 기준 ${pct(x.pb)}`} /></div>
          <span className="n">{pct(x.pa)} <small>기준 {pct(x.pb)}</small></span>
          <SegGap gap={x.gap} small={Math.round(x.pa * people.length / 100) < CONFIG.MIN_CELL} />
        </div>
      ))}
      <p className="muted small-text">세로 선은 비교 기준 비율입니다.</p>
    </div>
  )

  return (
    <>
      <Trail run={run} q={q} drill={drill} onReset={resetDrill} onTrimAttrs={trimAttrs} />
      {strip}
      <div className="seg-layout">
        <section className="card seg-stat">
          <p className="huge">{people.length}<small>명</small></p>
          <p>{drill.attrs.length ? `${qLabel(run.survey, q)} ${answerText(q, drill.answer)} 응답자 ${answerGroup.length}명 중 ${pct(people.length / answerGroup.length * 100)}` : ''}</p>
          <p className="muted">전체 {run.people.length}명 중 {pct(people.length / run.people.length * 100)}</p>
          {small ? (
            <div className="banner warn compact">표본 {people.length}명 · 기준 {CONFIG.MIN_GROUP}명 미만입니다. 비율 차이를 일반화하지 마세요.</div>
          ) : (
            <p className="ok-text small-text">표본 {people.length}명 · 기준({CONFIG.MIN_GROUP}명) 충족</p>
          )}
          <div className="q-box"><b>{qLabel(run.survey, q)} · {answerText(q, drill.answer)}</b><p>{q.text}</p></div>
          <button className="primary full" onClick={toPersonas}>이 집단의 페르소나 보기 ({people.length}명)</button>
        </section>
        <section className="card">
          <div className="card-top">
            <h2>집단 나누기</h2>
            <div className="seg-toggle" role="group" aria-label="보기 방식">
              <button className={effectiveSegMode === 'table' ? 'on' : ''} onClick={() => setResultsUi({ segMode: 'table' })}>표</button>
              <button className={effectiveSegMode === 'chart' ? 'on' : ''} onClick={() => setResultsUi({ segMode: 'chart' })}>차트</button>
            </div>
          </div>
          {avail.length ? (
            <>
              <div className="field narrow">
                <label htmlFor="seg-key">나눌 기준</label>
                <select id="seg-key" value={effectiveSegKey} onChange={(ev) => changeSegKey(ev.target.value)}>
                  {avail.map((k) => <option key={k} value={k}>{attrLabel(k)}</option>)}
                </select>
              </div>
              <p className="muted small-text">비교 기준: {baseDesc} · {CONFIG.HIGHLIGHT_PP}%p 이상 차이는 진하게 · {CONFIG.MIN_CELL}명 미만 행은 흐리게</p>
              {effectiveSegMode === 'table' ? table : chart}
            </>
          ) : <p className="muted">더 나눌 수 있는 기준이 없습니다.</p>}
        </section>
      </div>
    </>
  )
}
