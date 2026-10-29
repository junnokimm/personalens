import { expect, it } from 'vitest'
import { runProgress } from '../src/lib/runProgress.js'
import { groupError } from '../src/lib/cohort.js'

it('accepts 10,000 people and rejects the next integer', () => {
  expect(groupError({ count: 10000 })).toBe('')
  expect(groupError({ count: 10001 })).not.toBe('')
})
it('uses saved server counters, not elapsed time or a stale progress number', () => {
  expect(runProgress({ _server: true, total: 200, succeeded: 73, failed: 7, progress: 99 })).toEqual({ total: 200, succeeded: 73, failed: 7, remaining: 120, percent: 40 })
  expect(runProgress({ total: 20, succeeded: 18, failed: 2 }).percent).toBe(100)
  expect(runProgress({ total: 20, succeeded: 8, failed: 0, status: 'cancelled' }).percent).toBe(40)
})
