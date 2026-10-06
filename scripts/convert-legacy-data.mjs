/* legacy/*.js의 전역 변수(PERSONA_SCHEMA, KOREA_MAP)를 src/data/*.json으로 변환합니다.
   손으로 고치지 않습니다 — 이 스크립트를 다시 실행해 결과를 갱신하세요. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

function convert(varName, srcRelPath, outRelPath) {
  const srcPath = join(root, srcRelPath)
  const outPath = join(root, outRelPath)
  const code = readFileSync(srcPath, 'utf8')

  // 원본 파일을 실제로 실행해 JS 객체를 얻습니다 (수작업 변환 없음).
  const original = new Function(`${code}\nreturn ${varName};`)()
  if (original == null) throw new Error(`${srcRelPath}에서 ${varName}을 찾지 못했습니다.`)

  const json = JSON.stringify(original)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, json, 'utf8')

  // 깊은 비교: 방금 쓴 JSON을 다시 읽어 원본 객체와 같은지 확인합니다.
  const roundTrip = JSON.parse(readFileSync(outPath, 'utf8'))
  assert.deepStrictEqual(roundTrip, original, `${outRelPath}이 원본 ${varName}과 다릅니다.`)
  console.log(`OK  ${srcRelPath} -> ${outRelPath} (${json.length.toLocaleString()} bytes)`)
}

convert('PERSONA_SCHEMA', 'legacy/persona-schema.js', 'src/data/personaSchema.json')
convert('KOREA_MAP', 'legacy/korea-map.js', 'src/data/koreaMap.json')
