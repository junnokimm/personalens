/* CSV 내보내기(wide/long/codebook)가 원본과 바이트 단위로 같은지 확인한다.
 * 같은 localStorage 데이터(프로젝트+실행)를 원본 core.js/csv.js(node:vm)와 새 lib/csv.js 양쪽에 넣고 비교한다. */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

import { exportCsv } from '../src/lib/csv.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LEGACY_DIR = path.resolve(__dirname, '../legacy')

function loadLegacy() {
  const context = { console }
  vm.createContext(context)
  for (const file of ['persona-schema.js', 'core.js', 'csv.js']) {
    vm.runInContext(readFileSync(path.join(LEGACY_DIR, file), 'utf8'), context, { filename: file })
  }
  return context
}
const legacy = loadLegacy()

function readFixture(name) {
  return JSON.parse(readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'))
}

describe('CSV 내보내기가 원본과 바이트 단위로 같다', () => {
  for (const fixtureName of ['legacy-v4-storage.json']) {
    describe(fixtureName, () => {
      const data = readFixture(fixtureName)
      const project = data.projects[0]
      const run = project.runs[0]

      for (const format of ['wide', 'long', 'codebook']) {
        it(format, () => {
          const legacyCsv = legacy.PSCSV.exportCsv(project, run, format)
          const newCsv = exportCsv(project, run, format)
          expect(newCsv.length).toBe(legacyCsv.length)
          expect(Buffer.from(newCsv, 'utf8').equals(Buffer.from(legacyCsv, 'utf8'))).toBe(true)
        })
      }
    })
  }
})
