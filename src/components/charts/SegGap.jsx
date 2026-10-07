import { CONFIG } from '../../lib/config.js'

/* 원본 segGap() — 집단 나누기 표·차트·지도 목록에서 쓰는 차이(%p) 배지.
 * HIGHLIGHT_PP 이상이면 진하게(strong), small(표본 적음)이면 강조하지 않는다. */
export default function SegGap({ gap, small }) {
  return (
    <span className={`gap ${!small && Math.abs(gap) >= CONFIG.HIGHLIGHT_PP ? 'strong sg' : ''}`}>
      {gap >= 0 ? '+' : '−'}{Math.abs(gap).toFixed(1)}%p
    </span>
  )
}
