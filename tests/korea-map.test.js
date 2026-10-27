import { describe, expect, it } from 'vitest'

import baseMap from '../src/data/koreaMap.json'
import islandData from '../src/data/koreaMapIslands.json'
import personaSchema from '../src/data/personaSchema.json'
import { KOREA_MAP } from '../src/lib/koreaMap.js'
import { field, regionName } from '../src/lib/schema.js'

const subpaths = (d) => d.split('M').length - 1

describe('지도 섬 데이터', () => {
  it('지도 지역은 페르소나 지역 코드(regionName)와 1:1로 맞고, 섬은 별도 지역으로 생기지 않는다', () => {
    const personaRegions = field('region').options.map((o) => regionName(o.value)).sort()
    expect(Object.keys(KOREA_MAP.regions).sort()).toEqual(personaRegions)
    for (const name of ['독도', '울릉도', '백령도', '연평도']) expect(KOREA_MAP.regions[name]).toBeUndefined()
  })

  it('독도·울릉도는 경상북도, 백령도·연평도는 인천의 경로에 하위 경로로 합쳐진다', () => {
    const parentOf = Object.fromEntries(islandData.islands.map((i) => [i.name, i.parent]))
    expect(parentOf).toEqual({ 울릉도: '경상북도', 독도: '경상북도', 백령도: '인천', 연평도: '인천' })
    for (const island of islandData.islands) expect(KOREA_MAP.regions[island.parent].d).toContain(island.d)
    expect(subpaths(KOREA_MAP.regions['경상북도'].d)).toBe(subpaths(baseMap.regions['경상북도'].d) + 3) // 울릉도 1 + 독도 2(동도·서도)
    expect(subpaths(KOREA_MAP.regions['인천'].d)).toBe(subpaths(baseMap.regions['인천'].d) + 2)
  })

  it('섬의 상위 지역은 원자료의 시·군·구(울릉군·옹진군) 소속과 같다', () => {
    const districtParent = (suffix) => regionName(personaSchema.regionDistricts.find((d) => d.district.endsWith(suffix)).region)
    expect(districtParent('울릉군')).toBe('경상북도')
    expect(districtParent('옹진군')).toBe('인천')
  })

  it('옮겨 그린 섬과 클릭 영역은 지도 안에 있고, 원본 데이터는 바뀌지 않는다', () => {
    for (const i of KOREA_MAP.islands) {
      expect(i.at[0] - i.hitR).toBeGreaterThanOrEqual(0)
      expect(i.at[0] + i.hitR).toBeLessThanOrEqual(KOREA_MAP.w)
      expect(i.at[1] - i.hitR).toBeGreaterThanOrEqual(0)
    }
    expect(baseMap.regions['경상북도'].d).not.toContain(islandData.islands[0].d)
  })
})
