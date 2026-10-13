import { describe, expect, it } from 'vitest'

import { displayRegion, josa } from '../src/utils/format.js'

describe('josa', () => {
  it('1~20에서 받침 유무에 맞는 조사를 고른다', () => {
    // 일의 자리가 2·4·5·9가 아니면 받침 있음(이/을/과/은), 2·4·5·9면 받침 없음(가/를/와/는)
    const expected = {
      1: '이', 2: '가', 3: '이', 4: '가', 5: '가', 6: '이', 7: '이', 8: '이', 9: '가', 10: '이',
      11: '이', 12: '가', 13: '이', 14: '가', 15: '가', 16: '이', 17: '이', 18: '이', 19: '가', 20: '이',
    }
    for (const [n, want] of Object.entries(expected)) {
      expect(josa(Number(n), ['이', '가'])).toBe(want)
    }
  })

  it('100은 일의 자리가 0이라 받침 있음으로 본다', () => {
    expect(josa(100, ['이', '가'])).toBe('이')
    expect(josa(100, ['을', '를'])).toBe('을')
  })

  it('을/를, 과/와, 은/는 쌍에서도 같은 규칙을 따른다', () => {
    expect(josa(1, ['을', '를'])).toBe('을')
    expect(josa(2, ['을', '를'])).toBe('를')
    expect(josa(1, ['과', '와'])).toBe('과')
    expect(josa(2, ['과', '와'])).toBe('와')
    expect(josa(1, ['은', '는'])).toBe('은')
    expect(josa(2, ['은', '는'])).toBe('는')
  })
})

describe('displayRegion', () => {
  it('경기·강원·전북과 기존 5개를 모두 "-도"로 통일한다', () => {
    expect(displayRegion('경기')).toBe('경기도')
    expect(displayRegion('강원')).toBe('강원도')
    expect(displayRegion('전북')).toBe('전라북도')
    expect(displayRegion('경상남')).toBe('경상남도')
    expect(displayRegion('경상북')).toBe('경상북도')
    expect(displayRegion('전라남')).toBe('전라남도')
    expect(displayRegion('충청남')).toBe('충청남도')
    expect(displayRegion('충청북')).toBe('충청북도')
  })

  it('8개 광역시·특별시와 세종·제주는 그대로 둔다', () => {
    for (const name of ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '제주']) {
      expect(displayRegion(name)).toBe(name)
    }
  })
})
