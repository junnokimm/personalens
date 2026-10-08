import { Fragment, useRef, useState } from 'react'

import koreaMap from '../../data/koreaMap.json'
import { CONFIG } from '../../lib/config.js'
import SegGap from '../charts/SegGap.jsx'
import { pct } from '../../utils/format.js'

const SHORT = { '충청북도': '충북', '충청남도': '충남', '전라남도': '전남', '경상북도': '경북', '경상남도': '경남' }
const FULL_LABELS = ['강원', '경기', '충청북도', '충청남도', '전북', '전라남도', '경상북도', '경상남도', '제주']

/* 원본 miniMap() — 대상 집단 분포 미리보기용 축소판 지도 */
export default function KoreaMap({ rows }) {
  const by = Object.fromEntries(rows.map((r) => [r.value, r]))
  const cls = (r) => (!r ? 'm-empty' : 'm-s' + (r.percent < 5 ? 1 : r.percent < 10 ? 2 : r.percent < 20 ? 3 : 4))
  return (
    <div className="mini-map">
      <svg viewBox={`0 0 ${koreaMap.w} ${koreaMap.h}`} role="img" aria-label="시·도별 인원 지도">
        {Object.entries(koreaMap.regions).map(([n, g]) => (
          <path key={n} d={g.d} className={cls(by[n])}>
            <title>{n} {by[n] ? `${by[n].count}명 · ${pct(by[n].percent)}` : '0명'}</title>
          </path>
        ))}
      </svg>
      <div className="m-legend">
        <span>적음</span>
        {['m-s1', 'm-s2', 'm-s3', 'm-s4'].map((c) => <i key={c} className={c} />)}
        <span>많음</span>
        <i className="m-empty" />
        <span>0명</span>
      </div>
    </div>
  )
}

function mapClass(x, mapColor) {
  if (!x || !x.bc) return 'm-none'
  if (!x.c) return 'm-empty'
  if (x.c < CONFIG.MIN_CELL) return 'm-small'
  if (mapColor === 'gap') { const a = Math.abs(x.gap); if (a < 1) return 'm-0'; return (x.gap > 0 ? 'm-p' : 'm-n') + (a < 3 ? 1 : a < CONFIG.HIGHLIGHT_PP ? 2 : 3) }
  return 'm-s' + (x.pa < 5 ? 1 : x.pa < 10 ? 2 : x.pa < 20 ? 3 : 4)
}

/* 원본 mapView()/mapTip()/mapHi() — 집단 나누기의 전체 지도. 색 기준 전환, 툴팁(마우스·키보드), 클릭해서 좁히기,
 * 오른쪽 목록에 마우스를 올리면 지도도 강조한다. */
export function KoreaMapFull({ rows, mapColor, onColorChange, onNarrow }) {
  const wrapRef = useRef(null)
  const [hover, setHover] = useState(null)
  const [tipPos, setTipPos] = useState(null)

  const MAPROWS = Object.fromEntries(rows.map((r) => [r.v, r]))
  const x = hover ? MAPROWS[hover] : null

  function showTipAtPointer(name, clientX, clientY) {
    const wrap = wrapRef.current.getBoundingClientRect()
    setHover(name)
    setTipPos({ left: Math.min(clientX - wrap.left + 12, wrap.width - 150), top: clientY - wrap.top + 12 })
  }
  /* 원본 mapHi()/mapTip(el) — 지도 위 해당 지역 path를 찾아 그 위치에 말풍선을 띄운다(목록 hover·키보드 포커스용) */
  function showTipForRegion(name) {
    const wrap = wrapRef.current.getBoundingClientRect()
    const el = wrapRef.current.querySelector(`path[data-r="${name}"]`)
    setHover(name)
    if (!el) { setTipPos(null); return }
    const r = el.getBoundingClientRect()
    setTipPos({ left: Math.min(r.left + r.width / 2 - wrap.left + 12, wrap.width - 150), top: r.top + r.height / 2 - wrap.top + 12 })
  }
  function hideTip() { setHover(null) }

  const list = rows.filter((r) => r.c).sort((a, b) => (a.c < CONFIG.MIN_CELL) - (b.c < CONFIG.MIN_CELL) || Math.abs(b.gap) - Math.abs(a.gap))
  const zero = rows.filter((r) => !r.c && r.bc).map((r) => r.v)
  const legend = mapColor === 'gap' ? (
    <div className="m-legend"><span>적음</span>{['m-n3', 'm-n2', 'm-n1', 'm-0', 'm-p1', 'm-p2', 'm-p3'].map((c) => <i key={c} className={c} />)}<span>많음 (비교 기준 대비 %p)</span></div>
  ) : (
    <div className="m-legend"><span>낮음</span>{['m-s1', 'm-s2', 'm-s3', 'm-s4'].map((c) => <i key={c} className={c} />)}<span>높음 (이 집단 안 비율 5 · 10 · 20%)</span></div>
  )

  return (
    <div className="map-view">
      <div className="map-wrap" ref={wrapRef}>
        <svg viewBox={`0 0 ${koreaMap.w} ${koreaMap.h}`} role="group" aria-label="시·도별 지도">
          {Object.entries(koreaMap.regions).map(([name, g]) => {
            const rx = MAPROWS[name], can = rx && rx.c > 0
            return (
              <path
                key={name}
                d={g.d}
                className={`${mapClass(rx, mapColor)} ${hover === name ? 'hi' : ''}`}
                data-r={name}
                tabIndex={can ? 0 : undefined}
                role={can ? 'button' : undefined}
                aria-label={can ? `${name} ${rx.c}명 · 눌러서 좁히기` : `${name} 0명`}
                onClick={can ? () => onNarrow(name) : undefined}
                onKeyDown={can ? (ev) => { if (ev.key === 'Enter') onNarrow(name) } : undefined}
                onMouseMove={(ev) => showTipAtPointer(name, ev.clientX, ev.clientY)}
                onFocus={() => showTipForRegion(name)}
                onMouseLeave={hideTip}
                onBlur={hideTip}
              />
            )
          })}
          <g className="m-labels" aria-hidden="true">
            {FULL_LABELS.map((n) => {
              const g = koreaMap.regions[n], rx = MAPROWS[n]
              return (
                <Fragment key={n}>
                  <text x={g.c[0]} y={g.c[1]}>{SHORT[n] || n}</text>
                  {rx && rx.c ? <text className="cnt" x={g.c[0]} y={g.c[1] + 11}>{rx.c}명</text> : null}
                </Fragment>
              )
            })}
          </g>
        </svg>
        <div id="map-tip" className="map-tip" hidden={!hover} style={tipPos ? { left: tipPos.left, top: tipPos.top } : undefined}>
          {hover ? (
            <>
              <b>{hover}</b>
              {x?.bc ? (
                <>
                  <span>이 집단 {x.c}명 · {pct(x.pa)}</span>
                  <span>비교 기준 {pct(x.pb)}</span>
                  {x.c ? (x.c < CONFIG.MIN_CELL ? <span>표본 적음</span> : <span>{x.gap >= 0 ? '+' : '−'}{Math.abs(x.gap).toFixed(1)}%p</span>) : null}
                </>
              ) : <span>응답자 없음</span>}
            </>
          ) : null}
        </div>
      </div>
      <div className="map-side">
        <div className="seg-toggle small" role="group" aria-label="색 기준">
          <button className={mapColor === 'gap' ? 'on' : ''} onClick={() => onColorChange('gap')}>비교 기준 대비 차이</button>
          <button className={mapColor === 'share' ? 'on' : ''} onClick={() => onColorChange('share')}>이 집단 비율</button>
        </div>
        {legend}
        <div className="m-legend extra"><i className="m-small" /><span>{CONFIG.MIN_CELL}명 미만 (색 없음)</span><i className="m-empty" /><span>0명</span></div>
        <div className="m-list">
          {list.map((r) => (
            <button
              key={r.v}
              className={`m-row ${r.c < CONFIG.MIN_CELL ? 'thin' : ''}`}
              onClick={() => onNarrow(r.v)}
              onMouseEnter={() => showTipForRegion(r.v)}
              onMouseLeave={hideTip}
            >
              <span>{r.v}</span><span>{r.c}명 · {pct(r.pa)}</span><span className="muted">기준 {pct(r.pb)}</span>
              {r.c < CONFIG.MIN_CELL ? <span className="tag">표본 적음</span> : <SegGap gap={r.gap} small={false} />}
            </button>
          ))}
        </div>
        {zero.length ? <p className="muted small-text">0명: {zero.join(', ')}</p> : null}
        <p className="muted small-text">지역을 누르면 그 지역으로 좁힙니다. 서울·세종 같은 작은 지역은 목록이나 지도에 마우스를 올려 확인하세요.</p>
      </div>
    </div>
  )
}
