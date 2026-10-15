import baseMap from '../data/koreaMap.json'
import islandData from '../data/koreaMapIslands.json'

/* 지도 데이터 = 원본 시·도 경로(koreaMap.json) + 빠져 있던 섬(koreaMapIslands.json).
 * 섬은 별도 지역이 아니라 parent 시·도의 일부라서, parent 경로 d에 하위 경로로 합친다(MultiPolygon과 같은 구조).
 * 그래서 색·선택·강조(hi)가 parent와 항상 같이 움직이고, 지역 키(=attrValue의 시·도 이름)는 그대로 17개다.
 * 독도처럼 거주자가 없는 섬은 페르소나가 없어도 parent 집계에 그대로 포함될 뿐이다. */
const regions = Object.fromEntries(Object.entries(baseMap.regions).map(([name, g]) => [name, { ...g }]))
for (const island of islandData.islands) {
  const parent = regions[island.parent]
  if (!parent) throw new Error(`섬 ${island.name}의 상위 지역 ${island.parent}이 지도에 없습니다.`)
  parent.d += island.d
}

export const KOREA_MAP = {
  w: baseMap.w,
  h: baseMap.h,
  regions,
  /* 작은 섬 위에 겹쳐 그리는 것들: 클릭·마우스를 받는 투명 원(hitR), 위치 표시 고리(marker), 이름 */
  islands: islandData.islands.map(({ name, parent, at, hitR, marker, label }) => ({ name, parent, at, hitR, marker, label })),
  insets: islandData.insets,
}
