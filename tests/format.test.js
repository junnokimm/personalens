import { describe, expect, it } from 'vitest'

import { josa } from '../src/utils/format.js'

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
