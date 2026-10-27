import { Fragment, useRef, useState } from 'react'

import { CONFIG } from '../../lib/config.js'
import { KOREA_MAP as koreaMap } from '../../lib/koreaMap.js'
import SegGap from '../charts/SegGap.jsx'
import { displayRegion, pct } from '../../utils/format.js'

const SHORT = { '충청북도': '충북', '충청남도': '충남', '전라남도': '전남', '경상북도': '경북', '경상남도': '경남' }
const FULL_LABELS = ['강원', '경기', '충청북도', '충청남도', '전북', '전라남도', '경상북도', '경상남도', '제주']

/* 본토 밖 섬(울릉도·독도, 백령도·연평도)을 옮겨 그린 인셋의 점선 상자 — 지역 경로보다 먼저(아래에) 그린다 */
function InsetFrames() {
  return (
    <g className="m-insets" aria-hidden="true">
      {koreaMap.insets.map((b) => <rect key={b.id} x={b.x} y={b.y} width={b.w} height={b.h} rx="2" />)}
    </g>
  )
}

/* 작은 섬 위에 겹치는 층 — 위치 고리·이름, 그리고 클릭·마우스를 받는 투명 원.
 * 섬 모양 자체는 상위 시·도 경로에 합쳐져 있어 색·강조가 같이 바뀌고, 이 원은 너무 작은 섬을 눌러도
 * 상위 시·도가 선택되도록 같은 이벤트를 넘겨 준다(hitProps(상위 지역 이름)) */
function IslandOverlay({ hitProps, hitTitle }) {
  return (
    <g className="m-islands">
      {koreaMap.islands.map((i) => (
        <Fragment key={i.name}>
          {i.marker ? <circle className="m-marker" cx={i.at[0]} cy={i.at[1]} r={i.marker} aria-hidden="true" /> : null}
          <text className="m-island-name" x={i.label[0]} y={i.label[1]} aria-hidden="true">{i.name}</text>
          <circle className="m-hit" cx={i.at[0]} cy={i.at[1]} r={i.hitR} data-parent={i.parent} aria-hidden="true" {...(hitProps ? hitProps(i.parent) : {})}>
            {hitTitle ? <title>{hitTitle(i)}</title> : null}
          </circle>
        </Fragment>
      ))}
    </g>
  )
}

/* 원본 miniMap() — 대상 집단 분포 미리보기용 축소판 지도 */
export default function KoreaMap({ rows }) {
  const by = Object.fromEntries(rows.map((r) => [r.value, r]))
  const cls = (r) => (!r ? 'm-empty' : 'm-s' + (r.percent < 5 ? 1 : r.percent < 10 ? 2 : r.percent < 20 ? 3 : 4))
  const tip = (n) => `${displayRegion(n)} ${by[n] ? `${by[n].count}명 · ${pct(by[n].percent)}` : '0명'}`
  return (
    <div className="mini-map">
      <svg viewBox={`0 0 ${koreaMap.w} ${koreaMap.h}`} role="img" aria-label="시·도별 인원 지도">
        <InsetFrames />
        {Object.entries(koreaMap.regions).map(([n, g]) => (
          <path key={n} d={g.d} className={cls(by[n])}>
            <title>{tip(n)}</title>
          </path>
        ))}
        <IslandOverlay hitTitle={(i) => `${i.name} · ${tip(i.parent)}`} />
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

/* 선택지별 응답자 비교(A/B)용 색 — 기존 m-p(파랑)/m-n(주황) 톤을 그대로 재사용한다(A=파랑, B=주황로 이미 맞춰져 있음).
 * 집단 분석 지도(mapClass)와는 "0명" 판단 기준이 달라 별도 함수로 둔다: A·B 둘 다 0명이면 비어 있음으로 본다. */
function compareMapClass(x) {
  if (!x || (!x.c && !x.bc)) return 'm-empty'
  if (x.small) return 'm-small'
  const a = Math.abs(x.gap)
  if (a < 1) return 'm-0'
  return (x.gap > 0 ? 'm-p' : 'm-n') + (a < 3 ? 1 : a < CONFIG.HIGHLIGHT_PP ? 2 : 3)
}

/* 선택지별 응답자 비교(ResponseComparison.jsx)의 지역 지도 — KoreaMapFull과 같은 지도 데이터·라벨·툴팁 방식을 쓰되,
 * 좁히기·색 기준 전환·오른쪽 목록 없이 지도만 간단히 보여준다(막대 위에 놓는 용도) */
export function KoreaMapCompare({ rows }) {
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
  function showTipForRegion(name) {
    const wrap = wrapRef.current.getBoundingClientRect()
    const el = wrapRef.current.querySelector(`path[data-r="${name}"]`)
    setHover(name)
    if (!el) { setTipPos(null); return }
    const r = el.getBoundingClientRect()
    setTipPos({ left: Math.min(r.left + r.width / 2 - wrap.left + 12, wrap.width - 150), top: r.top + r.height / 2 - wrap.top + 12 })
  }
  function hideTip() { setHover(null) }

  return (
    <div className="cmp-map">
      <div className="map-wrap" ref={wrapRef}>
        <svg viewBox={`0 0 ${koreaMap.w} ${koreaMap.h}`} role="img" aria-label="지역별 A·B 비교 지도">
          <InsetFrames />
          {Object.entries(koreaMap.regions).map(([name, g]) => {
            const rx = MAPROWS[name]
            const has = rx && (rx.c || rx.bc)
            return (
              <path
                key={name}
                d={g.d}
                className={`${compareMapClass(rx)} ${hover === name ? 'hi' : ''}`}
                data-r={name}
                tabIndex={has ? 0 : undefined}
                aria-label={has ? `${displayRegion(name)} A ${rx.c}명 · B ${rx.bc}명` : `${displayRegion(name)} 0명`}
                onMouseMove={(ev) => showTipAtPointer(name, ev.clientX, ev.clientY)}
                onFocus={() => showTipForRegion(name)}
                onMouseLeave={hideTip}
                onBlur={hideTip}
              />
            )
          })}
          <g className="m-labels" aria-hidden="true">
            {FULL_LABELS.map((n) => {
              const g = koreaMap.regions[n]
              return <text key={n} x={g.c[0]} y={g.c[1]}>{SHORT[n] || n}</text>
            })}
          </g>
          <IslandOverlay hitProps={(name) => ({
            onMouseMove: (ev) => showTipAtPointer(name, ev.clientX, ev.clientY),
            onMouseLeave: hideTip,
          })} />
        </svg>
        <div className="map-tip" hidden={!hover} style={tipPos ? { left: tipPos.left, top: tipPos.top } : undefined}>
          {hover ? (
            <>
              <b>{displayRegion(hover)}</b>
              {x && (x.c || x.bc) ? (
                <>
                  <span>A {x.c}명 · {pct(x.pa)}</span>
                  <span>B {x.bc}명 · {pct(x.pb)}</span>
                  {x.small ? <span>표본 적음</span> : <span>{x.gap >= 0 ? '+' : '−'}{Math.abs(x.gap).toFixed(1)}%p</span>}
                </>
              ) : <span>A·B 모두 0명</span>}
            </>
          ) : null}
        </div>
      </div>
      <div className="m-legend">
        <span>B 높음</span>
        {['m-n3', 'm-n2', 'm-n1', 'm-0', 'm-p1', 'm-p2', 'm-p3'].map((c) => <i key={c} className={c} />)}
        <span>A 높음</span>
        <i className="m-small" /><span>{CONFIG.MIN_CELL}명 미만</span>
        <i className="m-empty" /><span>A·B 모두 0명</span>
      </div>
    </div>
  )
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
          <InsetFrames />
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
                aria-label={can ? `${displayRegion(name)} ${rx.c}명 · 눌러서 좁히기` : `${displayRegion(name)} 0명`}
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
          <IslandOverlay hitProps={(name) => {
            const can = MAPROWS[name]?.c > 0
            return {
              className: `m-hit ${can ? 'can' : ''}`,
              onClick: can ? () => onNarrow(name) : undefined,
              onMouseMove: (ev) => showTipAtPointer(name, ev.clientX, ev.clientY),
              onMouseLeave: hideTip,
            }
          }} />
        </svg>
        <div id="map-tip" className="map-tip" hidden={!hover} style={tipPos ? { left: tipPos.left, top: tipPos.top } : undefined}>
          {hover ? (
            <>
              <b>{displayRegion(hover)}</b>
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
              <span>{displayRegion(r.v)}</span><span>{r.c}명 · {pct(r.pa)}</span><span className="muted">기준 {pct(r.pb)}</span>
              {r.c < CONFIG.MIN_CELL ? <span className="tag">표본 적음</span> : <SegGap gap={r.gap} small={false} />}
            </button>
          ))}
        </div>
        {zero.length ? <p className="muted small-text">0명: {zero.map(displayRegion).join(', ')}</p> : null}
        <p className="muted small-text">지역을 누르면 그 지역으로 좁힙니다. 서울·세종 같은 작은 지역은 목록이나 지도에 마우스를 올려 확인하세요.</p>
      </div>
    </div>
  )
}
