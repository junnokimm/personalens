import koreaMap from '../../data/koreaMap.json'
import { pct } from '../../utils/format.js'

/* 원본 miniMap() — 대상 집단 분포 미리보기용 축소판 지도.
 * 집단 나누기의 전체 지도(mapView)는 결과 화면을 만드는 8단계에서 이 컴포넌트에 모드를 추가해 합친다. */
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
