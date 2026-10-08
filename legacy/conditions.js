/* 조건 팝업 — 대상 집단(원자료 조건)과 페르소나 목록 필터에서 함께 씁니다. R-13·14·15·26 */
let FM = null; // 열린 팝업 상태

function fmFields() {
  if (FM.mode === 'target') {
    return PERSONA_SCHEMA.fields.map((f) => ({ key: f.key, label: PS.attrLabel(f.key), group: f.group, type: PS.BIG5.includes(f.key) ? 'big5' : f.key === 'region' ? 'region' : f.type }));
  }
  const r = FM.run, out = [];
  for (const q of r.survey.questions) if (q.type !== 'text') out.push({ key: 'resp:' + q.id, label: PS.qLabel(r.survey, q) + ' 응답', group: '응답 조건', type: 'category' });
  for (const k of PS.ANALYSIS_KEYS) out.push({ key: k, label: PS.attrLabel(k), group: PS.BIG5.includes(k) ? '성격 (5단계)' : '응답자 속성', type: 'category' });
  return out;
}
const fmField = (key) => fmFields().find((f) => f.key === key);

/* 값 목록 {value,label,count} */
function fmOptions(key) {
  if (FM.mode === 'target') {
    return PS.field(key).options.map((o) => ({ value: o.value, label: o.label, count: o.count }));
  }
  const people = FM.base;
  if (key.startsWith('resp:')) {
    const q = FM.run.survey.questions.find((x) => x.id === key.slice(5));
    return PS.choices(q).map((label, i) => ({ value: String(i), label: q.type === 'likert' ? label : label, count: people.filter((p) => PS.answerOf(FM.run, p.id, q.id)?.answer === i).length }));
  }
  return PS.breakdown(people, key).map((d) => ({ value: d.value, label: d.value, count: d.count }));
}

function valueText(key, values, ctx = {}) {
  const mode = ctx.mode || 'target';
  if (mode === 'target' && PS.BIG5.includes(key)) { const t = values.map(PS.tScore); return Math.min(...t) + '~' + Math.max(...t) + '점'; }
  if (mode === 'target' && key === 'region') return values.map((v) => { const [r, d] = String(v).split('::'); return d ? PS.districtName(d) : PS.regionName(r) + ' 전체'; });
  if (key.startsWith('resp:') && ctx.run) { const q = ctx.run.survey.questions.find((x) => x.id === key.slice(5)); return values.map((v) => PS.answerText(q, Number(v))); }
  return values;
}
function fieldLabel(key, ctx = {}) {
  if (key.startsWith('resp:') && ctx.run) { const q = ctx.run.survey.questions.find((x) => x.id === key.slice(5)); return q ? PS.qLabel(ctx.run.survey, q) : '응답'; }
  return PS.attrLabel(key);
}
/* 조건 칩 HTML (다른 화면에서도 사용). removeFn이 있으면 × 버튼 표시 */
function filterChips(filters, ctx = {}, removeFn) {
  const entries = Object.entries(filters || {}).filter(([, v]) => v?.length);
  if (!entries.length) return `<p class="muted small-text">${ctx.empty || '조건 없음 · 한국인 전체에서 구성'}</p>`;
  return `<div class="chips">${entries.map(([key, values]) => {
    const v = valueText(key, values, ctx), list = Array.isArray(v) ? v : [v];
    const text = list.slice(0, 3).join(', ') + (list.length > 3 ? ` 외 ${list.length - 3}개` : '');
    return `<span class="fchip"><b>${esc(fieldLabel(key, ctx))}</b> ${esc(text)}${removeFn ? `<button class="fchip-x" aria-label="${esc(fieldLabel(key, ctx))} 조건 해제" onclick="${removeFn}('${esc(key)}')">×</button>` : ''}</span>`;
  }).join('')}</div>`;
}

function openFilterModal(opts) {
  FM = { ...opts, draft: PS.clone(opts.filters || {}), history: [], search: '', optSearch: '', limit: 120 };
  FM.active = opts.start || fmFields()[0].key;
  if (FM.mode === 'persona') FM.base = opts.base || opts.run.people;
  renderFM();
  $('#fm-search')?.focus();
}
function fmSnapshot() { FM.history.push(PS.clone(FM.draft)); if (FM.history.length > 30) FM.history.shift(); }
function fmUndo() { if (!FM.history.length) return; FM.draft = FM.history.pop(); renderFM(); }

function renderFM(keepFocus) {
  const scroll = ['.fm-list', '.fm-editor'].map((s) => [s, $(s)?.scrollTop || 0]);
  const focus = document.activeElement?.id, caret = document.activeElement?.selectionStart;
  const f = fmField(FM.active);
  $('#overlay').innerHTML = `<div class="backdrop" onclick="closeModal()"></div>
  <section class="modal fm" role="dialog" aria-modal="true" aria-labelledby="fm-title">
    <div class="modal-head"><h2 id="fm-title">${esc(FM.title)}</h2><button class="small" onclick="closeModal()">닫기</button></div>
    <div class="fm-summary">
      ${filterChips(FM.draft, { mode: FM.mode, run: FM.run, empty: '아직 고른 조건이 없습니다.' }, 'fmRemove')}
      <p class="fm-rule">같은 항목 안의 값은 <b>또는</b>, 서로 다른 항목끼리는 <b>그리고</b>로 묶입니다.</p>
    </div>
    <div class="fm-body">
      <div class="fm-list">
        <input id="fm-search" placeholder="조건 항목 검색" aria-label="조건 항목 검색" value="${esc(FM.search)}" oninput="FM.search=this.value;$('#fm-list-items').innerHTML=fmListHtml()">
        <div id="fm-list-items">${fmListHtml()}</div>
      </div>
      <div class="fm-editor">${f ? fmEditorHtml(f) : ''}</div>
    </div>
    <div class="fm-foot">${fmCountHtml()}
      <div class="row">${FM.history.length ? '<button class="small" onclick="fmUndo()">마지막 변경 되돌리기</button>' : ''}<button class="small" onclick="fmSnapshot();FM.draft={};renderFM()">전체 해제</button><button class="primary" onclick="fmApply()">조건 적용</button></div>
    </div>
  </section>`;
  for (const [s, top] of scroll) if ($(s)) $(s).scrollTop = top;
  if (focus && $('#' + focus)) { const el = $('#' + focus); el.focus(); if (caret != null && el.setSelectionRange) el.setSelectionRange(caret, caret); }
}
function fmListHtml() {
  const needle = FM.search.trim().toLowerCase();
  const fs = fmFields().filter((f) => !needle || (f.label + f.group).toLowerCase().includes(needle));
  if (!fs.length) return '<p class="muted small-text">검색 결과가 없습니다.</p>';
  return [...new Set(fs.map((f) => f.group))].map((g) => `<h4>${esc(g)}</h4>${fs.filter((f) => f.group === g).map((f) => {
    const n = FM.draft[f.key]?.length || 0;
    return `<button class="fm-field ${FM.active === f.key ? 'on' : ''}" onclick="FM.active='${f.key}';FM.optSearch='';FM.limit=120;renderFM()"><span>${esc(f.label)}</span>${n ? `<em>${f.type === 'big5' ? '범위' : n}</em>` : ''}</button>`;
  }).join('')}`).join('');
}
function fmEditorHtml(f) {
  const sel = FM.draft[f.key] || [];
  const head = `<div class="fm-edit-head"><h3>${esc(f.label)}</h3>${sel.length ? `<button class="link" onclick="fmRemove('${f.key}')">이 항목 해제</button>` : ''}</div>`;
  if (f.type === 'text') {
    return head + `<p class="muted small-text">서술 내용에 포함될 검색어를 한 줄에 하나씩 입력하세요. 하나라도 포함되면 조건에 맞습니다. 시연 데이터에는 서술이 없어 집단 구성에는 적용되지 않습니다.</p>
      <textarea id="fm-keywords" rows="6" placeholder="예: 등산&#10;여행" oninput="fmKeywords(this.value)">${esc(sel.join('\n'))}</textarea>`;
  }
  if (f.type === 'big5') return head + fmBig5Html(f, sel);
  if (f.type === 'region') return head + fmRegionHtml(sel);
  const opts = fmOptions(f.key), needle = FM.optSearch.trim().toLowerCase();
  const shown = opts.filter((o) => !needle || o.label.toLowerCase().includes(needle));
  const desc = FM.mode === 'target' ? `값 ${opts.length.toLocaleString()}개 · 오른쪽 숫자는 원자료 100만 명 중 인원` : `값 ${opts.length}개 · 오른쪽 숫자는 이 실행 응답자 중 인원`;
  return head + `<p class="muted small-text">${desc}</p>
    ${opts.length > 12 ? `<input id="fm-opt-search" placeholder="값 검색" aria-label="값 검색" value="${esc(FM.optSearch)}" oninput="FM.optSearch=this.value;FM.limit=120;fmRefreshOpts()">` : ''}
    <div class="row fm-actions"><button class="small" onclick="fmSelectShown()">${needle ? '검색 결과 모두 선택' : '모두 선택'}</button><span class="muted small-text">${sel.length}개 선택</span></div>
    <div class="fm-options" id="fm-opts">${shown.slice(0, FM.limit).map((o) => `<label class="fm-opt"><input type="checkbox" ${sel.includes(o.value) ? 'checked' : ''} onchange="fmToggle('${f.key}',${opts.indexOf(o)},this.checked)"><span>${esc(o.label)}</span><small>${o.count.toLocaleString()}명</small></label>`).join('') || '<p class="muted small-text">검색 결과가 없습니다.</p>'}
    ${shown.length > FM.limit ? `<button class="small" onclick="FM.limit+=120;renderFM()">더 보기 (${FM.limit} / ${shown.length.toLocaleString()})</button>` : ''}</div>`;
}
function fmBig5Html(f, sel) {
  const ranges = PS.big5Ranges(f.key), t = sel.map(PS.tScore);
  const lo = t.length ? Math.min(...t) : 20, hi = t.length ? Math.max(...t) : 80;
  const count = PS.field(f.key).options.filter((o) => { const s = PS.tScore(o.value); return s >= lo && s <= hi; }).reduce((a, o) => a + o.count, 0);
  return `<p class="muted small-text">T점수(20~80점) 범위로 고릅니다. 단계 버튼을 누르면 해당 구간이 바로 선택됩니다.</p>
    <div class="levels">${ranges.map((r, i) => `<button class="small ${t.length && r.min >= lo && r.max <= hi ? 'on' : ''}" onclick="fmBig5(${r.min},${r.max})">${r.label}<small>${r.min}~${r.max}</small></button>`).join('')}</div>
    <div class="range-box" aria-label="점수 범위">
      <div class="range-vals"><span>최소 <b>${lo}</b>점</span><span>최대 <b>${hi}</b>점</span></div>
      <label class="sr-only" for="fm-lo">최소 점수</label><input id="fm-lo" type="range" min="20" max="80" value="${lo}" oninput="fmBig5Soft()" onchange="renderFM()">
      <label class="sr-only" for="fm-hi">최대 점수</label><input id="fm-hi" type="range" min="20" max="80" value="${hi}" oninput="fmBig5Soft()" onchange="renderFM()">
    </div>
    <p class="small-text">${t.length ? `${lo}~${hi}점 · 원자료 중 ${count.toLocaleString()}명` : '아직 범위를 고르지 않았습니다. 전체 점수가 포함됩니다.'}</p>`;
}
function fmRegionHtml(sel) {
  const needle = FM.optSearch.trim();
  const opts = PS.field('region').options;
  return `<p class="muted small-text">시·도 전체 또는 시·군·구를 고르세요. 오른쪽 숫자는 원자료 100만 명 중 인원입니다.</p>
  <input id="fm-opt-search" placeholder="시·도, 시·군·구 검색" aria-label="지역 검색" value="${esc(FM.optSearch)}" oninput="FM.optSearch=this.value;fmRefreshOpts()">
  <div class="fm-options" id="fm-opts">${opts.map((o, i) => {
    const rows = PERSONA_SCHEMA.regionDistricts.filter((d) => d.region === o.value);
    const vis = rows.filter((d) => !needle || (PS.regionName(o.value) + PS.districtName(d.district)).includes(needle));
    if (needle && !vis.length) return '';
    const all = sel.includes(o.value), part = !all && rows.some((d) => sel.includes(o.value + '::' + d.district));
    return `<details class="region" ${needle || part ? 'open' : ''}><summary><span>${esc(PS.regionName(o.value))}</span><small>${all ? '전체 선택' : part ? '일부 선택' : ''} · ${o.count.toLocaleString()}명</small></summary>
      <label class="fm-opt"><input type="checkbox" ${all ? 'checked' : ''} onchange="fmRegion(${i},null,this.checked)"><span>${esc(PS.regionName(o.value))} 전체</span></label>
      ${vis.map((d) => `<label class="fm-opt child"><input type="checkbox" ${all || sel.includes(o.value + '::' + d.district) ? 'checked' : ''} onchange="fmRegion(${i},${rows.indexOf(d)},this.checked)"><span>${esc(PS.districtName(d.district))}</span><small>${d.count.toLocaleString()}명</small></label>`).join('')}
    </details>`;
  }).join('')}</div>`;
}
/* 값 검색 중에는 검색창을 두고 목록만 다시 그립니다 (한글 조합 유지) */
function fmRefreshOpts() {
  const tmp = document.createElement('div'); tmp.innerHTML = fmEditorHtml(fmField(FM.active));
  const fresh = tmp.querySelector('#fm-opts'); if (fresh && $('#fm-opts')) $('#fm-opts').replaceWith(fresh);
}
function fmCountHtml() {
  if (FM.mode === 'target') {
    const e = PS.estimateCount(FM.draft), short = FM.need && e.estimate < FM.need;
    return `<div class="fm-count ${e.estimate === 0 ? 'bad' : short ? 'warn' : ''}" role="status">
      <span>조건에 맞는 페르소나 <b>약 ${e.estimate.toLocaleString()}명</b> / ${e.total.toLocaleString()}명</span>
      <small>${e.estimate === 0 ? '조건을 만족하는 사람이 없습니다. 마지막 변경을 되돌리거나 조건을 줄이세요.' : short ? `구성할 인원(${FM.need}명)보다 적습니다.` : '항목끼리 독립이라고 가정한 추정치입니다.'}${e.hasText ? ' 서술 검색어 조건은 추정에서 빠집니다.' : ''}</small></div>`;
  }
  const n = PS.filterPeople(FM.run, FM.draft, FM.base).length;
  return `<div class="fm-count ${n === 0 ? 'bad' : ''}" role="status"><span>조건에 맞는 페르소나 <b>${n}명</b> / ${FM.base.length}명</span>${n === 0 ? '<small>조건을 만족하는 사람이 없습니다.</small>' : ''}</div>`;
}

function fmSet(key, values) { if (values.length) FM.draft[key] = values; else delete FM.draft[key]; }
function fmToggle(key, idx, checked) {
  fmSnapshot(); const v = fmOptions(key)[idx].value, cur = FM.draft[key] || [];
  fmSet(key, checked ? [...new Set([...cur, v])] : cur.filter((x) => x !== v)); renderFM();
}
function fmSelectShown() {
  fmSnapshot(); const needle = FM.optSearch.trim().toLowerCase();
  const vals = fmOptions(FM.active).filter((o) => !needle || o.label.toLowerCase().includes(needle)).map((o) => o.value);
  fmSet(FM.active, [...new Set([...(FM.draft[FM.active] || []), ...vals])]); renderFM();
}
function fmRemove(key) { fmSnapshot(); delete FM.draft[key]; renderFM(); }
function fmKeywords(text) { FM.draft[FM.active] = [...new Set(text.split('\n').map((t) => t.trim()).filter(Boolean))].slice(0, 50); if (!FM.draft[FM.active].length) delete FM.draft[FM.active]; $('.fm-summary').innerHTML = filterChips(FM.draft, { mode: FM.mode, empty: '아직 고른 조건이 없습니다.' }, 'fmRemove'); }
function fmBig5(lo, hi) {
  const key = FM.active, cur = FM.draft[key] || [], t = cur.map(PS.tScore);
  if (t.length && Math.min(...t) === lo && Math.max(...t) === hi && document.activeElement?.type !== 'range') { fmSnapshot(); delete FM.draft[key]; renderFM(); return; }
  fmSnapshot(); fmSet(key, PS.field(key).options.filter((o) => { const s = PS.tScore(o.value); return s >= lo && s <= hi; }).map((o) => o.value)); renderFM();
}
function fmBig5Soft() {
  let lo = +$('#fm-lo').value, hi = +$('#fm-hi').value; if (lo > hi) [lo, hi] = [hi, lo];
  const key = FM.active;
  fmSet(key, PS.field(key).options.filter((o) => { const s = PS.tScore(o.value); return s >= lo && s <= hi; }).map((o) => o.value));
  const vals = document.querySelectorAll('.range-vals b'); if (vals.length === 2) { vals[0].textContent = lo; vals[1].textContent = hi; }
  $('.fm-summary').innerHTML = filterChips(FM.draft, { mode: FM.mode, run: FM.run, empty: '아직 고른 조건이 없습니다.' }, 'fmRemove') + '<p class="fm-rule">같은 항목 안의 값은 <b>또는</b>, 서로 다른 항목끼리는 <b>그리고</b>로 묶입니다.</p>';
  $('.fm-count').outerHTML = fmCountHtml();
}
function fmRegion(i, child, checked) {
  fmSnapshot();
  const region = PS.field('region').options[i].value, rows = PERSONA_SCHEMA.regionDistricts.filter((d) => d.region === region);
  let sel = FM.draft.region || [];
  if (child === null) { sel = sel.filter((v) => v !== region && !v.startsWith(region + '::')); if (checked) sel.push(region); }
  else {
    if (sel.includes(region)) { sel = sel.filter((v) => v !== region); sel.push(...rows.map((d) => region + '::' + d.district)); }
    const v = region + '::' + rows[child].district; sel = sel.filter((x) => x !== v); if (checked) sel.push(v);
    if (rows.every((d) => sel.includes(region + '::' + d.district))) { sel = sel.filter((x) => !x.startsWith(region + '::')); sel.push(region); }
  }
  fmSet('region', [...new Set(sel)]); renderFM();
}
function fmApply() { const done = FM.onApply; const draft = PS.clone(FM.draft); closeModal(); done(draft); }
