import { Fragment, useState } from 'react'

import { filterPeople } from '../../lib/analysis.js'
import { clone } from '../../lib/random.js'
import { estimateCount, field, tScore } from '../../lib/schema.js'
import { useUiStore } from '../../store/useUiStore.js'
import Big5Range from './Big5Range.jsx'
import FilterChips from './FilterChips.jsx'
import { fmFields, fmOptions } from './filterModalHelpers.js'
import Modal from '../common/Modal.jsx'
import RegionPicker from './RegionPicker.jsx'

/* 원본 conditions.js 전체(openFilterModal/renderFM과 그 보조 함수들) — 전역 FM을 컴포넌트 state로 옮김.
 * mode가 'target'(대상 집단)/'persona'(페르소나 필터) 두 가지로 재사용된다. */
export default function FilterModal({ opts }) {
  const closeFilterModal = useUiStore((s) => s.closeFilterModal)
  const fields = fmFields(opts)
  const base = opts.mode === 'persona' ? (opts.base || opts.run.people) : null

  const [draft, setDraft] = useState(() => clone(opts.filters || {}))
  const [history, setHistory] = useState([])
  const [search, setSearch] = useState('')
  const [optSearch, setOptSearch] = useState('')
  const [limit, setLimit] = useState(120)
  const [active, setActive] = useState(opts.start || fields[0]?.key)

  function snapshot() { setHistory((h) => [...h, clone(draft)].slice(-30)) }
  function undo() {
    if (!history.length) return
    setDraft(history[history.length - 1])
    setHistory((h) => h.slice(0, -1))
  }
  function setField(key, values) {
    setDraft((d) => {
      const next = { ...d }
      if (values.length) next[key] = values
      else delete next[key]
      return next
    })
  }
  function removeField(key) {
    snapshot()
    setDraft((d) => { const next = { ...d }; delete next[key]; return next })
  }
  function toggleOption(key, value, checked) {
    snapshot()
    const cur = draft[key] || []
    setField(key, checked ? [...new Set([...cur, value])] : cur.filter((x) => x !== value))
  }
  function selectShown(key, values) {
    snapshot()
    setField(key, [...new Set([...(draft[key] || []), ...values])])
  }
  function handleKeywords(text) {
    const list = [...new Set(text.split('\n').map((t) => t.trim()).filter(Boolean))].slice(0, 50)
    setField(active, list)
  }
  function handleBig5LevelClick(min, max) {
    const sel = draft[active] || [], t = sel.map(tScore)
    snapshot()
    if (t.length && Math.min(...t) === min && Math.max(...t) === max) {
      setDraft((d) => { const next = { ...d }; delete next[active]; return next })
    } else {
      setField(active, field(active).options.filter((o) => { const s = tScore(o.value); return s >= min && s <= max }).map((o) => o.value))
    }
  }
  function handleBig5RangeChange(lo, hi) {
    setField(active, field(active).options.filter((o) => { const s = tScore(o.value); return s >= lo && s <= hi }).map((o) => o.value))
  }
  function apply() {
    opts.onApply(clone(draft))
    closeFilterModal()
  }

  const activeField = fields.find((f) => f.key === active)
  const needle = search.trim().toLowerCase()
  const filteredFields = fields.filter((f) => !needle || (f.label + f.group).toLowerCase().includes(needle))
  const groups = [...new Set(filteredFields.map((f) => f.group))]

  return (
    <Modal className="fm" onClose={closeFilterModal} labelledBy="fm-title">
      <div className="modal-head">
        <h2 id="fm-title">{opts.title}</h2>
        <button className="small" onClick={closeFilterModal}>닫기</button>
      </div>
      <div className="fm-summary">
        <FilterChips filters={draft} ctx={{ mode: opts.mode, run: opts.run, empty: '아직 고른 조건이 없습니다.' }} onRemove={removeField} />
        <p className="fm-rule">같은 항목 안의 값은 <b>또는</b>, 서로 다른 항목끼리는 <b>그리고</b>로 묶입니다.</p>
      </div>
      <div className="fm-body">
        <div className="fm-list">
          <input id="fm-search" placeholder="조건 항목 검색" aria-label="조건 항목 검색" value={search} onChange={(ev) => setSearch(ev.target.value)} autoFocus />
          <div id="fm-list-items">
            {!filteredFields.length ? <p className="muted small-text">검색 결과가 없습니다.</p> : groups.map((g) => (
              <Fragment key={g}>
                <h4>{g}</h4>
                {filteredFields.filter((f) => f.group === g).map((f) => {
                  const n = draft[f.key]?.length || 0
                  return (
                    <button key={f.key} className={`fm-field ${active === f.key ? 'on' : ''}`} onClick={() => { setActive(f.key); setOptSearch(''); setLimit(120) }}>
                      <span>{f.label}</span>
                      {n ? <em>{f.type === 'big5' ? '범위' : n}</em> : null}
                    </button>
                  )
                })}
              </Fragment>
            ))}
          </div>
        </div>
        <div className="fm-editor">
          {activeField ? <FieldEditor
            opts={opts}
            base={base}
            field={activeField}
            draft={draft}
            optSearch={optSearch}
            limit={limit}
            onRemoveField={removeField}
            onSetOptSearch={(v) => { setOptSearch(v); setLimit(120) }}
            onMoreLimit={() => setLimit((l) => l + 120)}
            onKeywords={handleKeywords}
            onToggleOption={toggleOption}
            onSelectShown={selectShown}
            onBig5LevelClick={handleBig5LevelClick}
            onBig5RangeChange={handleBig5RangeChange}
            onRegionSnapshot={snapshot}
            onRegionChange={(sel) => setField('region', sel)}
          /> : null}
        </div>
      </div>
      <div className="fm-foot">
        <FilterCount opts={opts} base={base} draft={draft} />
        <div className="row">
          {history.length ? <button className="small" onClick={undo}>마지막 변경 되돌리기</button> : null}
          <button className="small" onClick={() => { snapshot(); setDraft({}) }}>전체 해제</button>
          <button className="primary" onClick={apply}>조건 적용</button>
        </div>
      </div>
    </Modal>
  )
}

/* 원본 fmEditorHtml() */
function FieldEditor({ opts, base, field: f, draft, optSearch, limit, onRemoveField, onSetOptSearch, onMoreLimit, onKeywords, onToggleOption, onSelectShown, onBig5LevelClick, onBig5RangeChange, onRegionSnapshot, onRegionChange }) {
  const sel = draft[f.key] || []
  const head = (
    <div className="fm-edit-head">
      <h3>{f.label}</h3>
      {sel.length ? <button className="link" onClick={() => onRemoveField(f.key)}>이 항목 해제</button> : null}
    </div>
  )
  if (f.type === 'text') {
    return (
      <>
        {head}
        <p className="muted small-text">서술 내용에 포함될 검색어를 한 줄에 하나씩 입력하세요. 하나라도 포함되면 조건에 맞습니다. 시연 데이터에는 서술이 없어 집단 구성에는 적용되지 않습니다.</p>
        <textarea id="fm-keywords" rows={6} placeholder={'예: 등산\n여행'} value={sel.join('\n')} onChange={(ev) => onKeywords(ev.target.value)} />
      </>
    )
  }
  if (f.type === 'big5') {
    return (
      <>
        {head}
        <Big5Range fieldKey={f.key} selected={sel} onLevelClick={onBig5LevelClick} onRangeChange={onBig5RangeChange} />
      </>
    )
  }
  if (f.type === 'region') {
    return (
      <>
        {head}
        <RegionPicker selected={draft.region || []} onSnapshot={onRegionSnapshot} onChange={onRegionChange} />
      </>
    )
  }
  const options = fmOptions(opts, base, f.key)
  const oNeedle = optSearch.trim().toLowerCase()
  const shown = options.filter((o) => !oNeedle || o.label.toLowerCase().includes(oNeedle))
  const desc = opts.mode === 'target' ? `값 ${options.length.toLocaleString()}개 · 오른쪽 숫자는 원자료 100만 명 중 인원` : `값 ${options.length}개 · 오른쪽 숫자는 이 실행 응답자 중 인원`
  return (
    <>
      {head}
      <p className="muted small-text">{desc}</p>
      {options.length > 12 ? <input id="fm-opt-search" placeholder="값 검색" aria-label="값 검색" value={optSearch} onChange={(ev) => onSetOptSearch(ev.target.value)} /> : null}
      <div className="row fm-actions">
        <button className="small" onClick={() => onSelectShown(f.key, shown.map((o) => o.value))}>{oNeedle ? '검색 결과 모두 선택' : '모두 선택'}</button>
        <span className="muted small-text">{sel.length}개 선택</span>
      </div>
      <div className="fm-options" id="fm-opts">
        {shown.length ? shown.slice(0, limit).map((o) => (
          <label className="fm-opt" key={o.value}>
            <input type="checkbox" checked={sel.includes(o.value)} onChange={(ev) => onToggleOption(f.key, o.value, ev.target.checked)} />
            <span>{o.label}</span>
            <small>{o.count.toLocaleString()}명</small>
          </label>
        )) : <p className="muted small-text">검색 결과가 없습니다.</p>}
      </div>
      {shown.length > limit ? <button className="small" onClick={onMoreLimit}>더 보기 ({limit} / {shown.length.toLocaleString()})</button> : null}
    </>
  )
}

/* 원본 fmCountHtml() */
function FilterCount({ opts, base, draft }) {
  if (opts.mode === 'target') {
    const e = estimateCount(draft)
    const short = opts.need && e.estimate < opts.need
    return (
      <div className={`fm-count ${e.estimate === 0 ? 'bad' : short ? 'warn' : ''}`} role="status">
        <span>조건에 맞는 페르소나 <b>약 {e.estimate.toLocaleString()}명</b> / {e.total.toLocaleString()}명</span>
        <small>
          {e.estimate === 0 ? '조건을 만족하는 사람이 없습니다. 마지막 변경을 되돌리거나 조건을 줄이세요.' : short ? `구성할 인원(${opts.need}명)보다 적습니다.` : '항목끼리 독립이라고 가정한 추정치입니다.'}
          {e.hasText ? ' 서술 검색어 조건은 추정에서 빠집니다.' : ''}
        </small>
      </div>
    )
  }
  const n = filterPeople(opts.run, draft, base).length
  return (
    <div className={`fm-count ${n === 0 ? 'bad' : ''}`} role="status">
      <span>조건에 맞는 페르소나 <b>{n}명</b> / {base.length}명</span>
      {n === 0 ? <small>조건을 만족하는 사람이 없습니다.</small> : null}
    </div>
  )
}
