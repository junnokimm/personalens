import { useState } from 'react'

import personaSchema from '../../data/personaSchema.json'
import { districtName, field, regionName } from '../../lib/schema.js'

/* 원본 fmRegionHtml()/fmRegion() — 시·도 전체 또는 시·군·구 선택, 부모·자식 체크박스 동기화 */
export default function RegionPicker({ selected, onSnapshot, onChange }) {
  const [optSearch, setOptSearch] = useState('')
  const needle = optSearch.trim()
  const opts = field('region').options

  function toggle(regionValue, rows, childIndex, checked) {
    onSnapshot()
    let sel = selected
    if (childIndex === null) {
      sel = sel.filter((v) => v !== regionValue && !v.startsWith(regionValue + '::'))
      if (checked) sel.push(regionValue)
    } else {
      if (sel.includes(regionValue)) {
        sel = sel.filter((v) => v !== regionValue)
        sel.push(...rows.map((d) => regionValue + '::' + d.district))
      }
      const v = regionValue + '::' + rows[childIndex].district
      sel = sel.filter((x) => x !== v)
      if (checked) sel.push(v)
      if (rows.every((d) => sel.includes(regionValue + '::' + d.district))) {
        sel = sel.filter((x) => !x.startsWith(regionValue + '::'))
        sel.push(regionValue)
      }
    }
    onChange([...new Set(sel)])
  }

  return (
    <>
      <p className="muted small-text">시·도 전체 또는 시·군·구를 고르세요. 오른쪽 숫자는 원자료 100만 명 중 인원입니다.</p>
      <input id="fm-opt-search" placeholder="시·도, 시·군·구 검색" aria-label="지역 검색" value={optSearch} onChange={(ev) => setOptSearch(ev.target.value)} />
      <div className="fm-options" id="fm-opts">
        {opts.map((o) => {
          const rows = personaSchema.regionDistricts.filter((d) => d.region === o.value)
          const vis = rows.filter((d) => !needle || (regionName(o.value) + districtName(d.district)).includes(needle))
          if (needle && !vis.length) return null
          const all = selected.includes(o.value)
          const part = !all && rows.some((d) => selected.includes(o.value + '::' + d.district))
          return (
            <details className="region" key={o.value} open={needle || part || undefined}>
              <summary><span>{regionName(o.value)}</span><small>{all ? '전체 선택' : part ? '일부 선택' : ''} · {o.count.toLocaleString()}명</small></summary>
              <label className="fm-opt">
                <input type="checkbox" checked={all} onChange={(ev) => toggle(o.value, rows, null, ev.target.checked)} />
                <span>{regionName(o.value)} 전체</span>
              </label>
              {vis.map((d) => (
                <label className="fm-opt child" key={d.district}>
                  <input type="checkbox" checked={all || selected.includes(o.value + '::' + d.district)} onChange={(ev) => toggle(o.value, rows, rows.indexOf(d), ev.target.checked)} />
                  <span>{districtName(d.district)}</span>
                  <small>{d.count.toLocaleString()}명</small>
                </label>
              ))}
            </details>
          )
        })}
      </div>
    </>
  )
}
