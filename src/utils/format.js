export const stamp = (s) => new Date(s).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
export const pct = (x) => x.toFixed(1) + '%'

/* 숫자 n 뒤에 붙는 조사 고르기. pair는 [받침 있음, 받침 없음] 순서(예: ['이','가'], ['을','를'], ['과','와'], ['은','는']).
 * 일의 자리가 0이 아니면 그 숫자를 읽는 소리의 받침 여부로(2·4·5·9는 받침 없음),
 * 일의 자리가 0이면 "십·백·천·만·영"처럼 받침 있음으로 본다. */
export function josa(n, [withBatchim, withoutBatchim]) {
  const last = Math.abs(n) % 10
  const hasBatchim = last === 0 ? true : ![2, 4, 5, 9].includes(last)
  return hasBatchim ? withBatchim : withoutBatchim
}

/* 화면 표시 전용 시·도 이름. lib/schema.js의 regionName·attrValue(계산·CSV·지도 데이터가 쓰는 값)은
 * 그대로 두고, 눈에 보이는 문구만 여기서 통일한다("바꾸면 안 되는 것" 2번).
 * 기준: 이미 풀어 쓰던 5개(경상남도 등)에 경기도·강원도·전라북도까지 더해 8개를 "-도"로,
 * 나머지 8개 광역시·특별시와 세종·제주는 그대로 둔다. */
const REGION_DISPLAY_NAMES = {
  경기: '경기도', 강원: '강원도',
  경상남: '경상남도', 경상북: '경상북도',
  전라남: '전라남도', 전북: '전라북도',
  충청남: '충청남도', 충청북: '충청북도',
}
export const displayRegion = (raw) => REGION_DISPLAY_NAMES[raw] || raw
/* ANALYSIS_KEYS 값을 화면에 보여 줄 때 쓰는 공통 래퍼. key가 'region'일 때만 변환한다 */
export const displayAttrValue = (key, value) => (key === 'region' ? displayRegion(value) : value)
