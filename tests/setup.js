/* vitest 기본 환경(node)에는 localStorage가 없어 persist 미들웨어가 쓸 간단한 메모리 구현을 둔다.
 * 새 라이브러리를 추가하지 않기 위해 jsdom 대신 최소 구현만 둔다. */
class MemoryStorage {
  constructor() { this.data = new Map() }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null }
  setItem(key, value) { this.data.set(key, String(value)) }
  removeItem(key) { this.data.delete(key) }
  clear() { this.data.clear() }
}

if (typeof globalThis.localStorage?.setItem !== 'function') {
  globalThis.localStorage = new MemoryStorage()
}
