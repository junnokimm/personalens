/* PersonaScope 프로토타입 v4 — 화면 */
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const stamp = (s) => new Date(s).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const pct = (x) => x.toFixed(1) + '%';
const STORE = 'personascope-proto-v4';

/* ---------- 데이터 ---------- */
let data;
function load() {
  try { const d = JSON.parse(localStorage.getItem(STORE)); if (d?.projects?.length) data = d; } catch { /* 저장소 없음 */ }
  if (!data) data = { projects: [PS.sample()] };
  for (const p of data.projects) for (const r of p.runs) if (r.status === 'running') { r.status = 'failed'; r.failNote = '페이지를 새로 열어 실행이 멈췄습니다.'; }
}
let saveOk = true;
function save() { try { localStorage.setItem(STORE, JSON.stringify(data)); saveOk = true; } catch { saveOk = false; } const el = $('#save-state'); if (el) el.textContent = saveOk ? '자동 저장됨' : '저장 실패 · 브라우저 저장 공간을 확인하세요'; }
const touch = () => { P().updated = new Date().toISOString(); save(); };

/* ---------- 상태 ---------- */
let page = 'projects', projectId = null, runId = null;
let view = 'overall', qid = null, drill = { answer: null, attrs: [] }, segKey = 'sex', segMode = 'table';
let pf = {}, pSearch = '', pSort = 'id', pChatted = false, pPage = 0, personaId = null, chatQid = null, respCol = null;
let openQs = new Set(), job = null, failNext = false, lastDeleted = null, distKey = '';
const P = () => data.projects.find((p) => p.id === projectId);
const R = () => P()?.runs.find((r) => r.id === runId);
const G = (id) => P().groups.find((g) => g.id === (id || P().activeGroupId)) || P().groups[0];

/* ---------- 공통 UI ---------- */
function toast(text, actionLabel, action) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(text)}</span>${actionLabel ? `<button class="small" onclick="${action};$('#toast').hidden=true">${esc(actionLabel)}</button>` : ''}`;
  t.hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => (t.hidden = true), actionLabel ? 7000 : 3500);
}
function closeModal() { $('#overlay').innerHTML = ''; FM = null; }
let CONFIRM = null;
function confirmModal({ title, body, ok = '확인', danger = false, onOk }) {
  CONFIRM = onOk;
  $('#overlay').innerHTML = `<div class="backdrop" onclick="closeModal()"></div><section class="modal small-modal" role="dialog" aria-modal="true" aria-labelledby="cm-title">
    <h2 id="cm-title">${esc(title)}</h2><div class="cm-body">${body}</div>
    <div class="row end"><button onclick="closeModal()">취소</button><button class="${danger ? 'danger' : 'primary'}" id="cm-ok" onclick="const f=CONFIRM;closeModal();f()">${esc(ok)}</button></div></section>`;
  $('#cm-ok').focus();
}
const head = (title, sub, right = '') => `<div class="page-head"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div><div class="row">${right}</div></div>`;
const banner = (tone, html, actions = '') => `<div class="banner ${tone}"><div>${html}</div>${actions ? `<div class="row">${actions}</div>` : ''}</div>`;
const statusTag = (r) => r.status === 'completed' ? '<span class="tag ok">완료</span>' : r.status === 'failed' ? '<span class="tag bad">실패</span>' : `<span class="tag run"><i class="spin"></i>진행 중 ${r.progress}%</span>`;

/* ---------- 이동 ---------- */
function go(next, opts = {}) {
  if (next === 'projects') { projectId = null; runId = null; }
  if (!projectId && next !== 'projects') next = 'projects';
  page = next; if (opts.view) view = opts.view;
  render(); window.scrollTo(0, 0);
}
function openProject(id) { projectId = id; runId = null; page = 'summary'; render(); }
const section = () => (['survey', 'target'].includes(page) ? 'design' : page === 'simulation' ? 'sim' : page === 'projects' ? '' : 'over');

function render() {
  const a = document.activeElement, focusId = a?.id, caret = a?.selectionStart, caretEnd = a?.selectionEnd;
  const p = P();
  document.body.className = !p ? 'no-project' : '';
  $('#project-context').innerHTML = p ? `<button class="back" onclick="go('projects')">← 프로젝트 목록</button><p class="ctx-label">현재 프로젝트</p><p class="ctx-name">${esc(p.name)}</p>` : '';
  $('#nav').innerHTML = p ? navHtml() : '';
  $('#crumb').textContent = p ? p.name + ' / ' + pageTitle() : '프로젝트';
  $('#save-state').textContent = saveOk ? '자동 저장됨' : '저장 실패';
  const pages = { projects, summary, runs, results, survey: surveyPage, target: targetPage, simulation };
  $('#app').innerHTML = (pages[page] || projects)();
  if (matchMedia('(max-width: 760px)').matches) document.querySelector('.nav-child.on, .nav-root.on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  if (focusId && $('#' + CSS.escape(focusId))) { const el = $('#' + CSS.escape(focusId)); el.focus({ preventScroll: true }); try { if (caret != null) el.setSelectionRange(caret, caretEnd); } catch { /* select 등 */ } }
}
function pageTitle() {
  return { summary: '개요 · 프로젝트 요약', runs: '개요 · 실행 기록', results: '개요 · 결과', survey: '설계 · 설문', target: '설계 · 대상 집단', simulation: '시뮬레이션' }[page] || '';
}
function navStatus() {
  const p = P(), errs = PS.validateSurvey(p.survey).summary.length, stale = p.groups.filter(PS.groupStale).length;
  const survey = errs ? { c: 'bad', i: '!', t: '확인 필요' } : p.survey.draft && p.runs.length ? { c: 'warn', i: '!', t: PS.versionText(p.survey) } : !p.survey.version ? { c: 'todo', i: '', t: PS.versionText(p.survey) } : { c: 'ok', i: '✓', t: 'v' + p.survey.version };
  const groups = stale ? { c: 'warn', i: '!', t: '구성 필요' } : { c: 'ok', i: '✓', t: p.groups.length + '개' };
  return { survey, groups };
}
/* 왼쪽 사이드바 한 줄 구성 (Figma V4 이중 메뉴) — 상위 메뉴 아래에 하위 메뉴를 펼쳐 둡니다 */
function navHtml() {
  const p = P(), s = section(), st = navStatus(), running = p.runs.find((r) => r.status === 'running');
  const child = (on, label, act, meta) => `<button class="nav-child ${on ? 'on' : ''}" ${on ? 'aria-current="page"' : ''} onclick="${act}"><span>${label}</span>${meta || ''}</button>`;
  const mark = (x) => `<span class="st ${x.c}" title="${esc(x.t)}">${esc(x.t)}${x.i ? `<b>${x.i}</b>` : ''}</span>`;
  return `<div class="nav-group"><button class="nav-root ${s === 'over' ? 'on' : ''}" onclick="go('summary')"><span class="ico" aria-hidden="true">◎</span>개요</button>
      <div class="nav-children">${child(page === 'summary', '프로젝트 요약', "go('summary')")}${child(page === 'runs', '실행 기록', "go('runs')", `<span class="st">${p.runs.length}건</span>`)}${child(page === 'results', '결과', 'openResults()', R() ? `<span class="st">실행 #${R().number}</span>` : '')}</div></div>
    <div class="nav-group"><button class="nav-root ${s === 'design' ? 'on' : ''}" onclick="go('survey')"><span class="ico" aria-hidden="true">◇</span>설계</button>
      <div class="nav-children">${child(page === 'survey', '설문', "go('survey')", mark(st.survey))}${child(page === 'target', '대상 집단', "go('target')", mark(st.groups))}</div></div>
    <div class="nav-group"><button class="nav-root ${s === 'sim' ? 'on' : ''}" onclick="go('simulation')"><span class="ico" aria-hidden="true">▷</span>시뮬레이션${running ? `<em class="live" title="실행 중">${running.progress}%</em>` : ''}</button></div>
    <p class="nav-note">집단 분석·페르소나·인터뷰는 결과 안의 단계입니다.</p>`;
}
/* ---------- 프로젝트 목록 ---------- */
function projects() {
  return head('프로젝트', '프로젝트마다 설문 한 세트와 대상 집단, 실행 기록을 가집니다.', `<button class="primary" onclick="newProject()">새 프로젝트</button>`) +
    `<div class="project-grid">${data.projects.map((p) => `<button class="project-card" onclick="openProject('${p.id}')">
      <b>${esc(p.name)}</b><span class="muted">${esc(p.description || '설명 없음')}</span>
      <span class="meta">설문 ${PS.versionText(p.survey)} · 대상 집단 ${p.groups.length}개 · 실행 ${p.runs.length}건</span></button>`).join('')}</div>
    <p class="muted small-text">예시 데이터를 처음 상태로 돌리려면 <button class="link" onclick="resetDemo()">예시 데이터 다시 만들기</button></p>`;
}
function newProject() {
  confirmModal({ title: '새 프로젝트', ok: '만들기', body: `<div class="field"><label for="np-name">프로젝트 이름</label><input id="np-name" placeholder="예: 청년 주거 정책 인식 조사"></div><div class="field"><label for="np-desc">설명 (선택)</label><input id="np-desc"></div>`,
    onOk: () => {} });
  $('#cm-ok').onclick = () => {
    const name = $('#np-name').value.trim(); if (!name) { $('#np-name').focus(); return; }
    const g = PS.group('기본 집단');
    const p = { id: PS.uid('project'), name, description: $('#np-desc').value.trim(), updated: new Date().toISOString(), survey: { title: '', description: '', version: 0, draft: true, history: [], questions: [] }, groups: [g], activeGroupId: g.id, runs: [], chats: {} };
    data.projects.unshift(p); save(); closeModal(); projectId = p.id; page = 'survey'; render();
  };
  $('#np-name').focus();
}
function resetDemo() { confirmModal({ title: '예시 데이터 다시 만들기', body: '<p>모든 프로젝트와 실행 기록을 지우고 예시 프로젝트만 남깁니다.</p>', ok: '다시 만들기', danger: true, onOk: () => { data = { projects: [PS.sample()] }; save(); go('projects'); } }); }

/* ---------- 개요 · 프로젝트 요약 (R-06) ---------- */
function runRow(r, compact) {
  const action = r.status === 'completed' ? `<button class="small" onclick="openRun('${r.id}')">결과 보기</button>` : r.status === 'failed' ? `<button class="small" onclick="retryRun('${r.id}')">다시 시도</button>` : `<span class="progress-mini"><i style="width:${r.progress}%"></i></span>`;
  return `<div class="run-row"><div><b>실행 #${r.number}</b> ${statusTag(r)}<p class="muted small-text">${stamp(r.created)} · 설문 v${r.survey.version} · ${esc(r.groupName)} ${r.people.length}명${r.failNote ? ' · ' + esc(r.failNote) : ''}</p></div>${action}</div>`;
}
function summary() {
  const p = P(), last = p.runs[0], g = G(), errs = PS.validateSurvey(p.survey).summary;
  const qs = p.survey.questions, follow = qs.filter((q) => q.parentId).length;
  const chats = Object.entries(p.chats).filter(([, v]) => v.length).map(([k, v]) => { const [rid, pid] = k.split('::'); return { rid, pid, n: v.length, at: v[v.length - 1].created }; }).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 4);
  const draftBanner = p.survey.draft && p.runs.length ? banner('warn', `마지막 실행 이후 설문이 바뀌었습니다. 지금 결과는 이전 버전(v${p.survey.version}) 기준입니다. 다음 실행 때 v${p.survey.version + 1}로 확정됩니다.`, `<button class="small" onclick="go('simulation')">시뮬레이션으로</button>`) : '';
  return head(esc(p.name), esc(p.description || ''), `<button class="primary" onclick="go('simulation')">새 시뮬레이션</button>`) + draftBanner +
    `<div class="sum-grid">
      <section class="card sum"><h2>설문</h2><p class="big">${esc(p.survey.title || '주제 미입력')}</p>
        <p class="muted">${PS.versionText(p.survey)} · 문항 ${qs.length}개${follow ? ` (후속 질문 ${follow}개 포함)` : ''}</p>
        ${errs.length ? `<p class="err-text">확인할 내용 ${errs.length}개</p>` : ''}<button class="small" onclick="go('survey')">설문 열기</button></section>
      <section class="card sum"><h2>대상 집단</h2><p class="big">${esc(g.name)} · ${g.count}명</p>
        ${filterChips(g.filters)}<p class="muted small-text">저장된 대상 집단 ${p.groups.length}개${PS.groupStale(g) ? ' · 이 집단은 다시 구성이 필요합니다' : ''}</p><button class="small" onclick="go('target')">대상 집단 열기</button></section>
      <section class="card sum"><h2>최근 실행</h2>${last ? `<p class="big">실행 #${last.number} ${statusTag(last)}</p><p class="muted">${stamp(last.created)} · ${esc(last.groupName)} ${last.people.length}명</p>${last.status === 'completed' ? `<button class="small" onclick="openRun('${last.id}')">결과 보기</button>` : ''}` : '<p class="muted">아직 실행하지 않았습니다. 설계를 마친 뒤 시뮬레이션을 실행하세요.</p>'}</section>
    </div>
    <div class="two">
      <section class="card"><div class="card-top"><h2>최근 실행</h2><button class="small" onclick="go('runs')">실행 기록 전체</button></div>${p.runs.slice(0, 3).map((r) => runRow(r)).join('') || '<p class="muted">실행 기록이 없습니다.</p>'}</section>
      <section class="card"><div class="card-top"><h2>최근 인터뷰</h2></div>${chats.map((c) => { const r = p.runs.find((x) => x.id === c.rid); return r ? `<div class="run-row"><div><b>${esc(c.pid)}</b> <span class="tag">대화 ${c.n}건</span><p class="muted small-text">실행 #${r.number} · ${stamp(c.at)}</p></div><button class="small" onclick="openChat('${r.id}','${c.pid}')">이어서 대화</button></div>` : ''; }).join('') || '<p class="muted">결과 화면의 페르소나에서 인터뷰를 시작할 수 있습니다.</p>'}</section>
    </div>`;
}

/* ---------- 개요 · 실행 기록 ---------- */
function runs() {
  const p = P();
  return head('실행 기록', '이 프로젝트에서 실행한 시뮬레이션입니다. 실행 중에도 다른 화면으로 이동할 수 있습니다.', `<button class="primary" onclick="go('simulation')">새 시뮬레이션</button>`) +
    `<section class="card"><div class="table-wrap"><table><thead><tr><th>실행</th><th>시각</th><th>설문</th><th>대상 집단</th><th>상태</th><th></th></tr></thead><tbody>
    ${p.runs.map((r) => `<tr><td><b>실행 #${r.number}</b></td><td>${stamp(r.created)}</td><td>v${r.survey.version} · ${r.survey.questions.length}문항</td><td>${esc(r.groupName)} · ${r.people.length}명</td><td>${statusTag(r)}${r.failNote ? `<p class="muted small-text">${esc(r.failNote)}</p>` : ''}</td>
      <td class="right">${r.status === 'completed' ? `<button class="small" onclick="openRun('${r.id}')">결과 보기</button>` : r.status === 'failed' ? `<button class="small" onclick="retryRun('${r.id}')">다시 시도</button>` : `<span class="progress-mini"><i style="width:${r.progress}%"></i></span>`}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">실행 기록이 없습니다.</td></tr>'}
    </tbody></table></div></section>`;
}

/* ---------- 설계 · 설문 (R-09·10·11·12, N-01·11) ---------- */
function surveyPage() {
  const p = P(), s = p.survey, v = PS.validateSurvey(s), hist = s.history || [];
  const used = (ver) => p.runs.filter((r) => r.survey.version === ver).length;
  const verSel = `<label class="ver"><span>버전</span><select aria-label="설문 버전" onchange="restoreVersion(this.value);this.value=''">
    <option value="">${PS.versionText(s)}${!s.draft && s.version ? ' (현재)' : ''}</option>
    ${hist.slice().reverse().map((h) => `<option value="${h.version}">v${h.version} 불러오기 · 실행 ${used(h.version)}회 사용</option>`).join('')}</select></label>`;
  const verNote = s.draft && s.version ? `<span class="tag warn">v${s.version}에서 변경됨 · 다음 실행 때 v${s.version + 1}로 확정</span>` : !s.version ? '<span class="tag">아직 실행 전 · 첫 실행 때 v1로 확정</span>' : `<span class="tag ok">v${s.version} · 실행 ${used(s.version)}회에 사용</span>`;
  const tops = s.questions.filter((q) => !q.parentId);
  return head('설문', '문항을 만들고 순서를 정합니다. 버전은 입력할 때가 아니라 실행할 때 확정됩니다.', verSel) +
    `<div class="ver-line">${verNote}</div>` +
    (v.summary.length ? banner('bad', `<b>확인할 내용 ${v.summary.length}개</b><ul>${v.summary.slice(0, 4).map((e) => `<li>${esc(e.msg)}${e.qid ? ` <button class="link" onclick="focusQ('${e.qid}')">이동</button>` : ''}</li>`).join('')}</ul>`) : '') +
    `<section class="card"><h2>설문 정보</h2><p class="muted small-text">프로젝트의 메타 정보입니다. 개요와 시뮬레이션 화면에 표시되고, 페르소나에게도 조사 맥락으로 전달됩니다.</p>
      <div class="grid2"><div class="field"><label for="s-title">주제</label><input id="s-title" value="${esc(s.title)}" oninput="editS('title',this.value)" onchange="render()" class="${!s.title.trim() ? 'invalid' : ''}"></div>
      <div class="field"><label for="s-desc">목적</label><input id="s-desc" value="${esc(s.description)}" oninput="editS('description',this.value)" onchange="render()"></div></div></section>
    <section class="card"><div class="card-top"><div><h2>문항 ${s.questions.length}개</h2><p class="muted small-text">후속 질문은 앞 문항의 답을 기억한 채 이어서 답합니다. 번호는 Q1-1, Q1-2처럼 자동으로 붙습니다.</p></div>
      <div class="row"><button class="small" onclick="addQ('likert')">+ 척도형 문항</button><button class="small" onclick="addQ('choice')">+ 단일선택 문항</button><button class="small" onclick="addQ('text')">+ 주관식 문항</button></div></div>
      <div class="qlist">${tops.map((t, i) => qBlock(t, i, tops.length, v.byId) + s.questions.filter((c) => c.parentId === t.id).map((c, j, arr) => qBlock(c, j, arr.length, v.byId)).join('')).join('') || '<p class="empty">아직 문항이 없습니다. 위 버튼으로 문항을 추가하세요.</p>'}</div></section>`;
}
function qBlock(q, i, n, errs) {
  const s = P().survey, open = openQs.has(q.id), e = errs[q.id] || {}, label = PS.qLabel(s, q);
  const hasErr = Object.keys(e).length > 0;
  const head = `<div class="q-head"><button class="q-toggle" aria-expanded="${open}" onclick="toggleQ('${q.id}')"><span class="caret">${open ? '▾' : '▸'}</span><b>${label}</b><span class="tag">${PS.TYPE_LABEL[q.type]}</span><span class="q-preview">${esc(q.text || '질문 내용 없음')}</span>${hasErr ? '<span class="dot-err" title="확인 필요"></span>' : ''}</button>
    <div class="q-actions"><button class="icon" aria-label="${label} 위로" ${i === 0 ? 'disabled' : ''} onclick="moveQ('${q.id}',-1)">↑</button><button class="icon" aria-label="${label} 아래로" ${i === n - 1 ? 'disabled' : ''} onclick="moveQ('${q.id}',1)">↓</button>${!q.parentId ? `<button class="small" onclick="addFollow('${q.id}')">+ 후속 질문</button>` : ''}<button class="small" onclick="deleteQ('${q.id}')">삭제</button></div></div>`;
  if (!open) return `<div class="q ${q.parentId ? 'child' : ''}" id="q-${q.id}">${q.parentId ? '<p class="follow-note">후속 질문</p>' : ''}${head}</div>`;
  const opts = q.type === 'choice' ? `<div class="field"><label>선택지</label>${q.options.map((o, k) => `<div class="opt-row"><span class="muted">${k + 1}</span><div class="grow"><input id="o-${q.id}-${k}" aria-label="${label} 선택지 ${k + 1}" value="${esc(o)}" class="${e.options?.[k] ? 'invalid' : ''}" oninput="editOpt('${q.id}',${k},this.value)" onchange="render()">${e.options?.[k] ? `<p class="err-text">${esc(e.options[k])}</p>` : ''}</div><button class="small ghost" ${q.options.length <= 2 ? 'disabled' : ''} onclick="delOpt('${q.id}',${k})">삭제</button></div>`).join('')}
      <button class="small ghost" onclick="addOpt('${q.id}')">+ 선택지 추가</button>
      <label class="check"><input type="checkbox" ${q.otherEnabled ? 'checked' : ''} onchange="editQ('${q.id}','otherEnabled',this.checked)"> 기타(직접 입력) 선택지 포함</label></div>` : '';
  const lik = q.type === 'likert' ? `<div class="grid3"><div class="field"><label for="sc-${q.id}">점수 범위</label><select id="sc-${q.id}" onchange="editQ('${q.id}','scale',Number(this.value))">${[3, 5, 7].map((x) => `<option ${q.scale === x ? 'selected' : ''} value="${x}">${x}점</option>`).join('')}</select></div>
      <div class="field"><label for="lo-${q.id}">1점 이름</label><input id="lo-${q.id}" value="${esc(q.low)}" oninput="editQ('${q.id}','low',this.value)" onchange="render()"></div><div class="field"><label for="hi-${q.id}">${q.scale}점 이름</label><input id="hi-${q.id}" value="${esc(q.high)}" oninput="editQ('${q.id}','high',this.value)" onchange="render()"></div></div>` : '';
  return `<div class="q open ${q.parentId ? 'child' : ''}" id="q-${q.id}">${q.parentId ? `<p class="follow-note">후속 질문 · ${PS.qLabel(s, s.questions.find((x) => x.id === q.parentId))}에 이어서 묻습니다</p>` : ''}${head}
    <div class="q-body"><div class="field"><label for="t-${q.id}">질문 내용</label><textarea id="t-${q.id}" rows="2" class="${e.text ? 'invalid' : ''}" oninput="editQ('${q.id}','text',this.value)" onchange="render()">${esc(q.text)}</textarea>${e.text ? `<p class="err-text">${esc(e.text)}</p>` : ''}</div>
    <div class="field narrow"><label for="ty-${q.id}">응답 형식</label><select id="ty-${q.id}" onchange="changeType('${q.id}',this.value)">${Object.entries(PS.TYPE_LABEL).map(([k, l]) => `<option value="${k}" ${q.type === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    ${lik}${opts}${e.general ? `<p class="err-text">${esc(e.general)}</p>` : ''}</div></div>`;
}
const SQ = (id) => P().survey.questions.find((q) => q.id === id);
function markDraft() { P().survey.draft = true; touch(); }
/* 글자 입력 중에는 입력칸을 다시 그리지 않습니다 — 다시 그리면 한글 조합(ㅎ+ㅏ+ㄴ→한)이 끊깁니다.
   입력을 마치면(포커스 이동) onchange에서 화면 전체를 갱신합니다. */
function softSurvey() { $('#nav').innerHTML = navHtml(); }
function editS(k, v) { P().survey[k] = v; markDraft(); softSurvey(); }
function editQ(id, k, v) { SQ(id)[k] = v; markDraft(); if (['text', 'low', 'high'].includes(k)) softSurvey(); else render(); }
function changeType(id, t) { const q = SQ(id); q.type = t; if (t === 'choice' && q.options.length < 2) q.options = ['선택지 1', '선택지 2']; markDraft(); render(); }
function editOpt(id, k, v) { SQ(id).options[k] = v; markDraft(); softSurvey(); }
function addOpt(id) { const q = SQ(id); q.options.push('선택지 ' + (q.options.length + 1)); markDraft(); render(); $(`#o-${id}-${q.options.length - 1}`)?.focus(); }
function delOpt(id, k) { SQ(id).options.splice(k, 1); markDraft(); render(); }
function toggleQ(id) { openQs.has(id) ? openQs.delete(id) : openQs.add(id); render(); }
function focusQ(id) { openQs.add(id); render(); $('#q-' + id)?.scrollIntoView({ block: 'center' }); }
function addQ(type) { const q = PS.question(type); if (type === 'likert') { q.low = '전혀 그렇지 않다'; q.high = '매우 그렇다'; } P().survey.questions.push(q); openQs.add(q.id); markDraft(); render(); $('#t-' + q.id)?.focus(); }
function addFollow(pid) {
  const s = P().survey, q = PS.question('choice', pid);
  const kids = s.questions.filter((x) => x.parentId === pid), after = kids.length ? kids[kids.length - 1] : SQ(pid);
  s.questions.splice(s.questions.indexOf(after) + 1, 0, q); openQs.add(q.id); markDraft(); render(); $('#t-' + q.id)?.focus();
}
function moveQ(id, dir) {
  const s = P().survey, q = SQ(id), sibs = s.questions.filter((x) => (x.parentId || null) === (q.parentId || null));
  const i = sibs.indexOf(q), other = sibs[i + dir]; if (!other) return;
  const a = s.questions.indexOf(q), b = s.questions.indexOf(other); [s.questions[a], s.questions[b]] = [s.questions[b], s.questions[a]];
  s.questions = PS.ordered(s); markDraft(); render();
}
function deleteQ(id) {
  const s = P().survey, q = SQ(id), label = PS.qLabel(s, q);
  const removed = s.questions.filter((x) => x.id === id || x.parentId === id);
  lastDeleted = { items: PS.clone(removed), index: s.questions.indexOf(q) };
  s.questions = s.questions.filter((x) => !removed.includes(x)); markDraft(); render();
  toast(`${label} 문항을 삭제했습니다${removed.length > 1 ? ` (후속 질문 ${removed.length - 1}개 포함)` : ''}.`, '실행 취소', 'undoDelete()');
}
function undoDelete() { if (!lastDeleted) return; const s = P().survey; s.questions.splice(lastDeleted.index, 0, ...lastDeleted.items); s.questions = PS.ordered(s); lastDeleted = null; $('#toast').hidden = true; markDraft(); render(); toast('삭제를 취소했습니다.'); }
function restoreVersion(ver) {
  if (!ver) return; const s = P().survey, h = s.history.find((x) => String(x.version) === ver);
  confirmModal({ title: `v${ver} 불러오기`, body: `<p>v${ver}의 문항을 편집 화면으로 불러옵니다. 지금 편집 중인 내용은 사라집니다. 다음 실행 때 v${s.version + 1}로 확정됩니다.</p>`, ok: '불러오기',
    onOk: () => { s.title = h.title; s.description = h.description; s.questions = PS.clone(h.questions); markDraft(); render(); toast(`v${ver} 내용을 불러왔습니다.`); } });
}

/* ---------- 설계 · 대상 집단 (R-13·16·17, 복수 집단) ---------- */
function targetPage() {
  const p = P(), g = G(), est = PS.estimateCount(g.filters), stale = PS.groupStale(g), err = PS.groupError(g);
  const usedBy = (id) => p.runs.filter((r) => r.groupId === id).length;
  const list = `<div class="group-list">${p.groups.map((x) => `<button class="group-item ${x.id === g.id ? 'on' : ''}" onclick="P().activeGroupId='${x.id}';touch();render()">
      <b>${esc(x.name)}</b><span>${x.count}명 · ${PS.groupStale(x) ? '<em class="warn-text">구성 필요</em>' : '구성 완료'}</span><small>${Object.keys(x.filters).length ? Object.keys(x.filters).map((k) => PS.attrLabel(k)).slice(0, 3).join(', ') : '조건 없음'} · 실행 ${usedBy(x.id)}회</small></button>`).join('')}
    <button class="small add-group" onclick="addGroup()">+ 새 대상 집단</button></div>`;
  const preview = g.cohort ? groupPreview(g, stale) : `<section class="card"><h2>미리보기</h2><p class="empty">아직 구성하지 않았습니다. 조건을 고른 뒤 “대상 집단 구성”을 누르세요.</p></section>`;
  return head('대상 집단', '설문을 받을 합성 페르소나 집단을 조건으로 정의합니다. 여러 집단을 저장해 두고 실행할 때 고를 수 있습니다.') +
    `<div class="target-layout">${list}<div>
      <section class="card"><div class="card-top"><div class="field name-field"><label for="g-name">집단 이름</label><input id="g-name" value="${esc(g.name)}" oninput="G().name=this.value;touch();renderSide()"></div>
        <div class="row"><button class="small" onclick="dupGroup()">복제</button><button class="small" ${p.groups.length < 2 ? 'disabled' : ''} onclick="delGroup()">삭제</button></div></div>
        <div class="cond-box"><div class="card-top"><h3>대상 조건</h3><button class="small" onclick="openTargetFilter()">조건 선택</button></div>${filterChips(g.filters, {}, 'removeTargetFilter')}
          <p class="estimate ${est.estimate < g.count ? 'warn-text' : ''}">조건에 맞는 페르소나 <b>약 ${est.estimate.toLocaleString()}명</b> / ${est.total.toLocaleString()}명 <span class="muted small-text">(항목끼리 독립이라고 가정한 추정치)</span></p></div>
        <div class="row align-end"><div class="field count-field"><label for="g-count">페르소나 수 (${PS.CONFIG.MIN_PERSONAS}~${PS.CONFIG.MAX_PERSONAS}명)</label><input id="g-count" type="number" min="${PS.CONFIG.MIN_PERSONAS}" max="${PS.CONFIG.MAX_PERSONAS}" value="${g.count}" class="${err ? 'invalid' : ''}" oninput="G().count=Number(this.value);touch();render()"></div>
          <button class="primary" ${err ? 'disabled' : ''} onclick="build()">${g.cohort ? '대상 집단 다시 구성' : '대상 집단 구성'}</button></div>
        ${err ? `<p class="err-text">${esc(err)}</p>` : ''}
        ${est.estimate < g.count ? '<p class="warn-text small-text">조건에 맞는 인원이 구성할 인원보다 적을 수 있습니다. 조건을 줄이거나 인원을 낮추세요.</p>' : ''}
        ${stale && g.cohort ? banner('warn', '조건이 바뀌었습니다. 아래 미리보기는 이전 조건 기준입니다. 다시 구성해야 실행에 반영됩니다.') : ''}
        ${g.cohort?.textFiltersIgnored?.length ? `<p class="muted small-text">서술 조건(${esc(g.cohort.textFiltersIgnored.join(', '))})은 시연 데이터에 서술이 없어 구성에 적용되지 않았습니다.</p>` : ''}
      </section>${preview}</div></div>`;
}
function renderSide() { $('#nav').innerHTML = navHtml(); document.querySelectorAll('.group-item.on b').forEach((b) => (b.textContent = G().name)); }
function groupPreview(g, stale) {
  const people = g.cohort.people, keys = [...Object.keys(g.filters).filter((k) => PS.ANALYSIS_KEYS.includes(k)), 'age', 'sex', 'region', 'income_bracket'];
  if (!distKey || !PS.ANALYSIS_KEYS.includes(distKey)) distKey = keys[0];
  const rows = PS.breakdown(people, distKey), max = Math.max(...rows.map((r) => r.percent), 1);
  const traits = (p) => PS.BIG5.filter((k) => /높음/.test(PS.attrValue(p, k))).map((k) => PS.attrLabel(k) + ' ' + PS.attrValue(p, k)).slice(0, 2);
  return `<section class="card ${stale ? 'dim' : ''}"><div class="card-top"><h2>분포 미리보기 · ${people.length}명</h2>
      <label class="inline-sel">기준 <select aria-label="분포 기준" onchange="distKey=this.value;render()">${PS.ANALYSIS_KEYS.map((k) => `<option value="${k}" ${k === distKey ? 'selected' : ''}>${esc(PS.attrLabel(k))}</option>`).join('')}</select></label></div>
      <div class="${distKey === 'region' ? 'dist-map' : ''}">${distKey === 'region' ? miniMap(rows) : ''}<div class="dist">${rows.map((r) => `<div class="dist-row"><span>${esc(r.value)}</span><div class="track"><i style="width:${(r.percent / max) * 100}%"></i></div><span class="num">${r.count}명 · ${pct(r.percent)}</span></div>`).join('')}</div></div></section>
    <section class="card ${stale ? 'dim' : ''}"><h2>프로필 미리보기</h2><div class="people-grid">${people.slice(0, 6).map((p) => `<div class="mini"><b>${p.id} · ${esc(PS.attrValue(p, 'age'))} ${esc(PS.attrValue(p, 'sex'))}</b>
      <span>${esc(PS.attrValue(p, 'region'))} ${esc(PS.districtName(p.attributes.district))}</span><span>${esc(p.attributes.occupation)}</span><span>소득 ${esc(PS.attrValue(p, 'income_bracket'))}</span>
      <div class="chips">${traits(p).map((t) => `<span class="chip">${esc(t)}</span>`).join('')}</div></div>`).join('')}</div>
      <p class="muted small-text">가상 시연 프로필입니다. 원자료 분포 비율대로 뽑았으며 실제 레코드를 추출한 것이 아닙니다.</p></section>`;
}
function openTargetFilter() { openFilterModal({ mode: 'target', title: '대상 조건 선택', filters: G().filters, need: G().count, start: 'age', onApply: (f) => { G().filters = f; touch(); render(); } }); }
function removeTargetFilter(key) { delete G().filters[key]; touch(); render(); }
function build() { try { PS.buildCohort(G()); touch(); render(); toast(`${G().name} · ${G().count}명을 구성했습니다.`); } catch (e) { toast(e.message); } }
function addGroup() { const g = PS.group('새 대상 집단 ' + (P().groups.length + 1)); P().groups.push(g); P().activeGroupId = g.id; touch(); render(); $('#g-name')?.select(); }
function dupGroup() { const src = G(), g = { ...PS.clone(src), id: PS.uid('group'), name: src.name + ' (복사본)', cohort: null }; P().groups.push(g); P().activeGroupId = g.id; touch(); render(); toast('복사본을 만들었습니다. 조건을 바꾼 뒤 구성하세요.'); }
function delGroup() { const g = G(); confirmModal({ title: '대상 집단 삭제', danger: true, ok: '삭제', body: `<p>“${esc(g.name)}”을 삭제합니다. 이 집단으로 실행한 결과는 남습니다.</p>`, onOk: () => { P().groups = P().groups.filter((x) => x.id !== g.id); P().activeGroupId = P().groups[0].id; touch(); render(); } }); }

/* ---------- 시뮬레이션 (R-07·08, N-03·04·09) ---------- */
function sameAsRun(g) {
  const p = P(); if (p.survey.draft || PS.groupStale(g)) return null;
  return p.runs.find((r) => r.status === 'completed' && r.groupId === g.id && r.survey.version === p.survey.version && new Date(g.cohort.created) <= new Date(r.created) && JSON.stringify(r.groupConfig) === JSON.stringify({ count: g.count, filters: g.filters })) || null;
}
function simulation() {
  const p = P(), g = G(), errs = PS.validateSurvey(p.survey).summary, stale = PS.groupStale(g), ready = !errs.length && !stale;
  const nQ = p.survey.questions.length, same = ready ? sameAsRun(g) : null, last = p.runs.find((r) => r.status === 'completed'), running = p.runs.find((r) => r.status === 'running');
  const diffs = last ? [
    p.survey.draft ? `설문: v${last.survey.version} → v${p.survey.version + 1} (변경됨)` : last.survey.version !== p.survey.version ? `설문: v${last.survey.version} → v${p.survey.version}` : '설문: 같음',
    last.groupId !== g.id ? `대상 집단: ${last.groupName} → ${g.name}` : JSON.stringify(last.groupConfig) !== JSON.stringify({ count: g.count, filters: g.filters }) ? '대상 집단: 조건 또는 인원 변경' : '대상 집단: 같음',
  ] : [];
  return head('시뮬레이션', '설계한 설문과 대상 집단으로 합성 응답을 만듭니다. 설정은 설계 메뉴에서 바꿉니다.') +
    `<div class="two even">
      <section class="card"><div class="card-top"><h2>설문</h2><button class="small" onclick="go('survey')">설계에서 수정</button></div>
        <p class="big">${esc(p.survey.title || '주제 미입력')}</p><p class="muted">${p.survey.draft || !p.survey.version ? `v${p.survey.version + 1}로 확정되어 실행됩니다` : `v${p.survey.version}`} · 문항 ${nQ}개</p>
        ${errs.length ? `<p class="err-text">확인할 내용 ${errs.length}개 · ${esc(errs[0].msg)}</p>` : '<p class="ok-text">준비됨</p>'}</section>
      <section class="card"><div class="card-top"><h2>대상 집단</h2><button class="small" onclick="go('target')">설계에서 수정</button></div>
        <div class="field"><label for="sim-group">실행할 대상 집단</label><select id="sim-group" onchange="P().activeGroupId=this.value;touch();render()">${p.groups.map((x) => `<option value="${x.id}" ${x.id === g.id ? 'selected' : ''}>${esc(x.name)} · ${x.count}명${PS.groupStale(x) ? ' (구성 필요)' : ''}</option>`).join('')}</select></div>
        ${filterChips(g.filters)}${stale ? `<p class="err-text">이 집단은 현재 조건으로 구성되지 않았습니다. <button class="link" onclick="go('target')">대상 집단에서 구성</button></p>` : '<p class="ok-text">준비됨</p>'}</section>
    </div>
    <section class="card run-card"><div class="card-top"><div><h2>실행</h2><p class="muted">${g.count}명 × 문항 ${nQ}개 = 예상 응답 <b>${(g.count * nQ).toLocaleString()}개</b></p></div>
      <span class="tag ${ready ? 'ok' : 'bad'}">${ready ? '실행 가능' : '설계 확인 필요'}</span></div>
      ${diffs.length ? `<p class="small-text muted">실행 #${last.number}과 비교 · ${diffs.map(esc).join(' · ')}</p>` : ''}
      ${running ? banner('info', `실행 #${running.number}이 진행 중입니다 (${running.progress}%). 다른 화면으로 이동해도 계속되고, 끝나면 알림이 뜹니다. 한 번에 하나씩 실행할 수 있습니다.`) : same ? banner('info', `실행 #${same.number}과 설정이 같습니다. 시연 생성기는 같은 결과를 냅니다.`, `<button class="small primary" onclick="openRun('${same.id}')">실행 #${same.number} 결과 보기</button><button class="small" onclick="confirmRun()">그래도 새로 실행</button>`)
        : `<button class="primary" ${ready ? '' : 'disabled'} onclick="confirmRun()">시뮬레이션 실행</button>`}
      <details class="demo"><summary>시연 옵션</summary><label class="check"><input type="checkbox" ${failNext ? 'checked' : ''} onchange="failNext=this.checked"> 다음 실행을 60%에서 실패시키기 (실패·다시 시도 확인용)</label></details>
    </section>
    <section class="card"><div class="card-top"><h2>최근 실행</h2><button class="small" onclick="go('runs')">실행 기록 전체</button></div>${p.runs.slice(0, 3).map((r) => runRow(r)).join('') || '<p class="muted">실행 기록이 없습니다.</p>'}</section>`;
}
function confirmRun() {
  const p = P(), g = G(), nQ = p.survey.questions.length;
  confirmModal({ title: '시뮬레이션을 실행할까요?', ok: '실행',
    body: `<dl class="confirm-dl"><div><dt>설문</dt><dd>${esc(p.survey.title)} · v${p.survey.draft || !p.survey.version ? p.survey.version + 1 : p.survey.version} · 문항 ${nQ}개</dd></div>
      <div><dt>대상 집단</dt><dd>${esc(g.name)} · ${g.count}명${filterChips(g.filters)}</dd></div><div><dt>예상 응답</dt><dd>${(g.count * nQ).toLocaleString()}개</dd></div></dl>
      <p class="muted small-text">실행 중에도 다른 화면으로 이동할 수 있습니다. 끝나면 알림이 뜹니다.</p>`, onOk: startRun });
}
function startRun() {
  const p = P(); let r;
  if (p.runs.some((x) => x.status === 'running')) { toast('진행 중인 실행이 끝난 뒤 다시 실행하세요.'); return; }
  try { r = PS.createRun(p, G()); } catch (e) { toast(e.message); return; }
  r.failAt = failNext ? 60 : null; failNext = false; p.runs.unshift(r); touch(); tick(p.id, r.id); render();
  toast(`실행 #${r.number}을 시작했습니다.`);
}
function tick(pid, rid) {
  clearInterval(job); job = setInterval(() => {
    const p = data.projects.find((x) => x.id === pid), r = p?.runs.find((x) => x.id === rid); if (!r) { clearInterval(job); return; }
    r.progress = Math.min(100, r.progress + 10);
    if (r.failAt && r.progress >= r.failAt) { r.status = 'failed'; r.failNote = `${r.progress}%에서 멈췄습니다 · 성공 응답 ${Math.round(r.responses.length * r.progress / 100)}개`; r.failAt = null; clearInterval(job); save(); render(); toast(`실행 #${r.number}이 실패했습니다.`, '실행 기록 보기', "go('runs')"); return; }
    if (r.progress >= 100) { r.status = 'completed'; r.failNote = ''; clearInterval(job); save(); render(); toast(`실행 #${r.number}이 완료됐습니다.`, '결과 보기', `openRun('${r.id}')`); return; }
    save(); refreshProgress();
  }, 450);
}
function refreshProgress() { if (['summary', 'runs', 'simulation'].includes(page)) render(); else $('#nav').innerHTML = navHtml(); }
function retryRun(id) { const r = P().runs.find((x) => x.id === id); r.status = 'running'; r.failNote = ''; save(); tick(P().id, id); render(); }

/* ---------- 개요 · 결과 ---------- */
function openResults() { const r = R() || P().runs.find((x) => x.status === 'completed'); if (r) openRun(r.id); else { page = 'results'; runId = null; render(); } }
function openRun(id, v = 'overall') {
  runId = id; const r = R(); if (!r) return;
  qid = r.survey.questions.find((q) => q.type !== 'text')?.id || r.survey.questions[0].id;
  drill = { answer: null, attrs: [] }; pf = {}; pSearch = ''; pPage = 0; personaId = null; view = v; page = 'results'; render(); window.scrollTo(0, 0);
}
function openChat(rid, pid) { openRun(rid, 'chat'); personaId = pid; chatQid = null; render(); }
const Q = () => R().survey.questions.find((q) => q.id === qid);
function results() {
  const r = R();
  if (!r) return head('결과', '') + `<section class="card empty">완료된 실행이 없습니다. <button class="link" onclick="go('simulation')">시뮬레이션 실행하기</button></section>`;
  if (r.status !== 'completed') return head('결과', '') + `<section class="card empty">실행 #${r.number}은 ${r.status === 'running' ? '진행 중입니다 (' + r.progress + '%).' : '실패했습니다.'} <button class="link" onclick="go('runs')">실행 기록 보기</button></section>`;
  const done = P().runs.filter((x) => x.status === 'completed');
  const strip = `<div class="run-strip"><label><span>실행</span><select aria-label="실행 선택" onchange="openRun(this.value)">${done.map((x) => `<option value="${x.id}" ${x.id === r.id ? 'selected' : ''}>실행 #${x.number} · ${stamp(x.created)}</option>`).join('')}</select></label>
    <div><span>설문</span><b>v${r.survey.version} · ${r.survey.questions.length}문항</b></div><div><span>대상 집단</span><b>${esc(r.groupName)} · ${r.people.length}명</b></div><div><span>상태</span><b>합성 응답 · 미검증</b></div></div>`;
  const tabGroup = ['overall', 'segment'].includes(view) ? 'overall' : view === 'export' ? 'export' : 'people';
  const tabs = `<div class="tabs" role="tablist">${[['overall', '전체 결과'], ['people', '페르소나'], ['export', '내보내기']].map(([k, l]) => `<button role="tab" aria-selected="${tabGroup === k}" class="${tabGroup === k ? 'on' : ''}" onclick="${k === 'overall' ? "view=drill.answer!==null?'segment':'overall'" : k === 'people' ? "view='personas'" : "view='export'"};render()">${l}</button>`).join('')}</div>`;
  const body = { overall: overallView, segment: segmentView, personas: personasView, detail: detailView, chat: chatView, export: exportView }[view]();
  return head('결과', '응답 분포에서 시작해 세부 집단과 페르소나까지 좁혀 봅니다.') + strip + tabs + body;
}

/* 질문 탭 (R-18) */
function questionTabs(onPick = 'pickQ') {
  const r = R();
  return `<div class="qtabs" role="tablist" aria-label="문항">${r.survey.questions.map((q) => `<button role="tab" aria-selected="${q.id === qid}" class="${q.id === qid ? 'on' : ''} ${q.parentId ? 'child' : ''}" onclick="${onPick}('${q.id}')">${PS.qLabel(r.survey, q)}<small>${PS.TYPE_LABEL[q.type]}</small></button>`).join('')}</div>`;
}
function pickQ(id) { qid = id; drill = { answer: null, attrs: [] }; view = 'overall'; render(); }
function questionHead(q) {
  const r = R(), parent = q.parentId ? r.survey.questions.find((x) => x.id === q.parentId) : null;
  return `<div class="q-title"><h2><span class="qno">${PS.qLabel(r.survey, q)}</span>${esc(q.text)}</h2><p class="muted small-text">${PS.TYPE_LABEL[q.type]}${q.type === 'likert' ? ` · ${q.scale}점 척도 (1 = ${esc(q.low)}, ${q.scale} = ${esc(q.high)})` : ''}${parent ? ` · ${PS.qLabel(r.survey, parent)}에 이어서 물은 후속 질문` : ''}</p></div>`;
}
const shade = (q, i) => (q.type === 'likert' ? 's' + (Math.round((i / (q.scale - 1)) * 4) + 1) : 'sc');
function overallView() {
  const r = R(), q = Q(), stats = PS.responseStats(r, q.id);
  if (q.type === 'text') {
    const rows = PS.validResponses(r, q.id);
    return `<section class="card">${questionTabs()}${questionHead(q)}<p class="muted small-text">유효 응답 ${stats.valid}명 · 누락 ${stats.missing}명</p>
      <div class="table-wrap"><table><thead><tr><th>페르소나</th><th>응답</th></tr></thead><tbody>${rows.slice(0, 30).map((a) => `<tr class="click" tabindex="0" onclick="openPersona('${a.personaId}')"><td>${a.personaId}</td><td>${esc(a.text)}</td></tr>`).join('')}</tbody></table></div>${rows.length > 30 ? `<p class="muted small-text">처음 30개만 표시합니다. 전체는 내보내기에서 받으세요.</p>` : ''}</section>`;
  }
  const dist = PS.distribution(r, q.id);
  return `<section class="card">${questionTabs()}${questionHead(q)}
    <div class="dist-head"><span>응답 분포 · 유효 ${stats.valid}명${stats.missing ? ` · 누락 ${stats.missing}명` : ''}</span><span class="muted small-text">막대를 누르면 그 응답을 고른 사람들을 분석합니다</span></div>
    <div class="answers">${dist.map((d, i) => `<button class="answer" onclick="startSegment(${i})"><span class="a-label">${esc(d.label)}</span><span class="a-track"><i class="${shade(q, i)}" style="width:${d.percent}%"></i></span><span class="a-pct">${pct(d.percent)}</span><span class="a-n">${d.count}명</span><span class="a-go">집단 분석</span></button>`).join('')}</div>
    <p class="muted small-text">비율 분모: 유효 응답 ${stats.valid}명</p></section>` + responseComparison(r, q);
}

const segGap = (g, small) => `<span class="gap ${!small && Math.abs(g) >= PS.CONFIG.HIGHLIGHT_PP ? 'strong sg' : ''}">${g >= 0 ? '+' : '−'}${Math.abs(g).toFixed(1)}%p</span>`;
/* 드릴다운 경로 — 단계마다 인원이 줄어드는 모습을 보여 줍니다 (R-25) */
function trail(extra = []) {
  const r = R(), q = Q(), steps = [{ label: '전체 응답자', n: r.people.length, act: "drill={answer:null,attrs:[]};view='overall';render()" }];
  if (drill.answer !== null) {
    const f = { ['resp:' + q.id]: [String(drill.answer)] };
    steps.push({ label: `${PS.qLabel(r.survey, q)} · ${PS.answerText(q, drill.answer)}`, n: PS.filterPeople(r, f).length, act: "drill.attrs=[];view='segment';render()" });
    drill.attrs.forEach((a, i) => { Object.assign(f, { [a.key]: [a.value] }); steps.push({ label: `${PS.attrLabel(a.key)}: ${a.value}`, n: PS.filterPeople(r, f).length, act: `drill.attrs=drill.attrs.slice(0,${i + 1});view='segment';render()` }); });
  }
  const all = [...steps, ...extra];
  return `<nav class="trail" aria-label="탐색 경로">${all.map((s, i) => `${i ? '<span class="sep" aria-hidden="true"></span>' : ''}${i === all.length - 1 ? `<span class="step cur" aria-current="page">${esc(s.label)}${s.n != null ? `<b>${s.n}명</b>` : ''}</span>` : `<button class="step" onclick="${s.act}">${esc(s.label)}${s.n != null ? `<b>${s.n}명</b>` : ''}</button>`}`).join('')}</nav>`;
}
function startSegment(i) { drill = { answer: i, attrs: [] }; segKey = PS.ANALYSIS_KEYS[0]; view = 'segment'; render(); window.scrollTo(0, 0); }
const drillFilters = () => { const f = drill.answer !== null ? { ['resp:' + qid]: [String(drill.answer)] } : {}; for (const a of drill.attrs) f[a.key] = [a.value]; return f; };
function segmentView() {
  const r = R(), q = Q(), dist = PS.distribution(r, q.id);
  const people = PS.filterPeople(r, drillFilters());
  const baseF = {}; for (const a of drill.attrs) baseF[a.key] = [a.value];
  const base = PS.filterPeople(r, baseF);
  const answerGroup = PS.filterPeople(r, { ['resp:' + q.id]: [String(drill.answer)] });
  const avail = PS.ANALYSIS_KEYS.filter((k) => !drill.attrs.some((a) => a.key === k));
  if (!avail.includes(segKey)) segKey = avail[0];
  const small = people.length < PS.CONFIG.MIN_GROUP;
  const values = PS.sortValues(segKey, [...new Set([...people, ...base].map((p) => PS.attrValue(p, segKey)))]);
  const rows = values.map((v) => { const c = people.filter((p) => PS.attrValue(p, segKey) === v).length, bc = base.filter((p) => PS.attrValue(p, segKey) === v).length; const pa = people.length ? c / people.length * 100 : 0, pb = base.length ? bc / base.length * 100 : 0; return { v, c, bc, pa, pb, gap: pa - pb }; });
  if (segMode === 'map' && segKey !== 'region') segMode = 'table';
  const baseDesc = drill.attrs.length ? `${drill.attrs.map((a) => PS.attrLabel(a.key) + ' ' + a.value).join(', ')} 전체 (${PS.qLabel(r.survey, q)} 응답과 관계없이)` : '전체 응답자';
  const strip = `<div class="whole"><p class="small-text muted">${PS.qLabel(r.survey, q)} 전체 응답 분포 · 다른 응답을 누르면 기준이 바뀝니다</p><div class="stack">${dist.map((d, i) => d.count ? `<button class="${shade(q, i)} ${i === drill.answer ? 'on' : ''}" style="flex:${d.count}" title="${esc(d.label)} ${pct(d.percent)}" onclick="startSegment(${i})"><span>${q.type === 'likert' ? i + 1 + '점' : esc(d.label)}</span><b>${pct(d.percent)}</b></button>` : '').join('')}</div></div>`;
  const table = `<div class="table-wrap"><table class="seg-table"><thead><tr><th>${esc(PS.attrLabel(segKey))}</th><th>이 집단 (${people.length}명)</th><th>비교 기준 (${base.length}명)</th><th class="w-bars">비교</th><th>차이</th><th></th></tr></thead><tbody>
    ${rows.map((x) => { const c = Math.round(x.pa * people.length / 100); return `<tr class="${c < PS.CONFIG.MIN_CELL ? 'thin' : ''}"><td>${esc(x.v)}</td><td><b>${c}명</b> · ${pct(x.pa)}</td><td>${pct(x.pb)}</td><td><div class="pair"><i class="pa" style="width:${x.pa}%"></i></div><div class="pair"><i class="pbase" style="width:${x.pb}%"></i></div></td><td>${segGap(x.gap, c < PS.CONFIG.MIN_CELL)}</td><td class="right">${c ? `<button class="small" onclick="narrow('${esc(x.v)}')">좁히기</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div>`;
  const chart = `<div class="seg-chart">${rows.map((x) => `<div class="seg-bar"><span class="v">${esc(x.v)}</span><div class="track wide"><i class="pa" style="width:${x.pa}%"></i><em class="marker" style="left:${x.pb}%" title="비교 기준 ${pct(x.pb)}"></em></div><span class="n">${pct(x.pa)} <small>기준 ${pct(x.pb)}</small></span>${segGap(x.gap, Math.round(x.pa * people.length / 100) < PS.CONFIG.MIN_CELL)}</div>`).join('')}<p class="muted small-text">세로 선은 비교 기준 비율입니다.</p></div>`;
  return trail() + strip + `<div class="seg-layout">
    <section class="card seg-stat"><p class="huge">${people.length}<small>명</small></p>
      <p>${drill.attrs.length ? `${PS.qLabel(r.survey, q)} ${PS.answerText(q, drill.answer)} 응답자 ${answerGroup.length}명 중 ${pct(people.length / answerGroup.length * 100)}` : ''}</p>
      <p class="muted">전체 ${r.people.length}명 중 ${pct(people.length / r.people.length * 100)}</p>
      ${small ? `<div class="banner warn compact">표본 ${people.length}명 · 기준 ${PS.CONFIG.MIN_GROUP}명 미만입니다. 비율 차이를 일반화하지 마세요.</div>` : `<p class="ok-text small-text">표본 ${people.length}명 · 기준(${PS.CONFIG.MIN_GROUP}명) 충족</p>`}
      <div class="q-box"><b>${PS.qLabel(r.survey, q)} · ${esc(PS.answerText(q, drill.answer))}</b><p>${esc(q.text)}</p></div>
      <button class="primary full" onclick="toPersonas()">이 집단의 페르소나 보기 (${people.length}명)</button></section>
    <section class="card"><div class="card-top"><h2>집단 나누기</h2><div class="seg-toggle" role="group" aria-label="보기 방식"><button class="${segMode === 'table' ? 'on' : ''}" onclick="segMode='table';render()">표</button><button class="${segMode === 'chart' ? 'on' : ''}" onclick="segMode='chart';render()">차트</button>${segKey === 'region' ? `<button class="${segMode === 'map' ? 'on' : ''}" onclick="segMode='map';render()">지도</button>` : ''}</div></div>
      ${avail.length ? `<div class="field narrow"><label for="seg-key">나눌 기준</label><select id="seg-key" onchange="segKey=this.value;segMode=this.value==='region'?'map':segMode==='map'?'table':segMode;render()">${avail.map((k) => `<option value="${k}" ${k === segKey ? 'selected' : ''}>${esc(PS.attrLabel(k))}</option>`).join('')}</select></div>
      <p class="muted small-text">비교 기준: ${esc(baseDesc)} · ${PS.CONFIG.HIGHLIGHT_PP}%p 이상 차이는 진하게 · ${PS.CONFIG.MIN_CELL}명 미만 행은 흐리게</p>${segMode === 'map' ? mapView(rows) : segMode === 'table' ? table : chart}` : '<p class="muted">더 나눌 수 있는 기준이 없습니다.</p>'}</section></div>`;
}
/* 지역 지도 보기 (NEW-01) — 분석 기준이 지역(시·도)일 때 */
let mapColor = 'gap', MAPROWS = {};
const SHORT = { '충청북도': '충북', '충청남도': '충남', '전라남도': '전남', '경상북도': '경북', '경상남도': '경남' };
function mapClass(x) {
  if (!x || !x.bc) return 'm-none';
  if (!x.c) return 'm-empty';
  if (x.c < PS.CONFIG.MIN_CELL) return 'm-small';
  if (mapColor === 'gap') { const a = Math.abs(x.gap); if (a < 1) return 'm-0'; return (x.gap > 0 ? 'm-p' : 'm-n') + (a < 3 ? 1 : a < PS.CONFIG.HIGHLIGHT_PP ? 2 : 3); }
  return 'm-s' + (x.pa < 5 ? 1 : x.pa < 10 ? 2 : x.pa < 20 ? 3 : 4);
}
function mapView(rows) {
  MAPROWS = Object.fromEntries(rows.map((r) => [r.v, r]));
  const M = KOREA_MAP, labels = ['강원', '경기', '충청북도', '충청남도', '전북', '전라남도', '경상북도', '경상남도', '제주'];
  const paths = Object.entries(M.regions).map(([name, g]) => {
    const x = MAPROWS[name], can = x && x.c > 0;
    return `<path d="${g.d}" class="${mapClass(x)}" data-r="${name}" ${can ? `tabindex="0" role="button" aria-label="${name} ${x.c}명 · 눌러서 좁히기" onclick="narrow('${name}')" onkeydown="if(event.key==='Enter')narrow('${name}')"` : `aria-label="${name} 0명"`} onmousemove="mapTip(this,event)" onfocus="mapTip(this)" onmouseleave="mapTip()" onblur="mapTip()"></path>`;
  }).join('');
  const texts = labels.map((n) => { const g = M.regions[n], x = MAPROWS[n]; return `<text x="${g.c[0]}" y="${g.c[1]}">${SHORT[n] || n}</text>${x && x.c ? `<text class="cnt" x="${g.c[0]}" y="${g.c[1] + 11}">${x.c}명</text>` : ''}`; }).join('');
  const list = rows.filter((x) => x.c).sort((a, b) => (a.c < PS.CONFIG.MIN_CELL) - (b.c < PS.CONFIG.MIN_CELL) || Math.abs(b.gap) - Math.abs(a.gap));
  const zero = rows.filter((x) => !x.c && x.bc).map((x) => x.v);
  const legend = mapColor === 'gap'
    ? `<div class="m-legend"><span>적음</span>${['m-n3', 'm-n2', 'm-n1', 'm-0', 'm-p1', 'm-p2', 'm-p3'].map((c) => `<i class="${c}"></i>`).join('')}<span>많음 (비교 기준 대비 %p)</span></div>`
    : `<div class="m-legend"><span>낮음</span>${['m-s1', 'm-s2', 'm-s3', 'm-s4'].map((c) => `<i class="${c}"></i>`).join('')}<span>높음 (이 집단 안 비율 5 · 10 · 20%)</span></div>`;
  return `<div class="map-view"><div class="map-wrap"><svg viewBox="0 0 ${M.w} ${M.h}" role="group" aria-label="시·도별 지도">${paths}<g class="m-labels" aria-hidden="true">${texts}</g></svg><div id="map-tip" class="map-tip" hidden></div></div>
    <div class="map-side"><div class="seg-toggle small" role="group" aria-label="색 기준"><button class="${mapColor === 'gap' ? 'on' : ''}" onclick="mapColor='gap';render()">비교 기준 대비 차이</button><button class="${mapColor === 'share' ? 'on' : ''}" onclick="mapColor='share';render()">이 집단 비율</button></div>
      ${legend}<div class="m-legend extra"><i class="m-small"></i><span>${PS.CONFIG.MIN_CELL}명 미만 (색 없음)</span><i class="m-empty"></i><span>0명</span></div>
      <div class="m-list">${list.map((x) => `<button class="m-row ${x.c < PS.CONFIG.MIN_CELL ? 'thin' : ''}" onclick="narrow('${esc(x.v)}')" onmouseenter="mapHi('${esc(x.v)}',1)" onmouseleave="mapHi('${esc(x.v)}',0)"><span>${esc(x.v)}</span><span>${x.c}명 · ${pct(x.pa)}</span><span class="muted">기준 ${pct(x.pb)}</span>${x.c < PS.CONFIG.MIN_CELL ? '<span class="tag">표본 적음</span>' : segGap(x.gap, false)}</button>`).join('')}</div>
      ${zero.length ? `<p class="muted small-text">0명: ${zero.map(esc).join(', ')}</p>` : ''}
      <p class="muted small-text">지역을 누르면 그 지역으로 좁힙니다. 서울·세종 같은 작은 지역은 목록이나 지도에 마우스를 올려 확인하세요.</p></div></div>`;
}
function miniMap(rows) {
  const by = Object.fromEntries(rows.map((r) => [r.value, r])), M = KOREA_MAP;
  const cls = (r) => (!r ? 'm-empty' : 'm-s' + (r.percent < 5 ? 1 : r.percent < 10 ? 2 : r.percent < 20 ? 3 : 4));
  return `<div class="mini-map"><svg viewBox="0 0 ${M.w} ${M.h}" role="img" aria-label="시·도별 인원 지도">${Object.entries(M.regions).map(([n, g]) => `<path d="${g.d}" class="${cls(by[n])}"><title>${n} ${by[n] ? by[n].count + '명 · ' + pct(by[n].percent) : '0명'}</title></path>`).join('')}</svg>
    <div class="m-legend"><span>적음</span>${['m-s1', 'm-s2', 'm-s3', 'm-s4'].map((c) => `<i class="${c}"></i>`).join('')}<span>많음</span><i class="m-empty"></i><span>0명</span></div></div>`;
}
function mapTip(el, e) {
  const tip = $('#map-tip'); if (!tip) return;
  document.querySelectorAll('.map-wrap path.hi').forEach((p) => p.classList.remove('hi'));
  if (!el) { tip.hidden = true; return; }
  el.classList.add('hi');
  const x = MAPROWS[el.dataset.r], wrap = el.closest('.map-wrap').getBoundingClientRect(), r = el.getBoundingClientRect();
  tip.innerHTML = `<b>${esc(el.dataset.r)}</b>${x && x.bc ? `<span>이 집단 ${x.c}명 · ${pct(x.pa)}</span><span>비교 기준 ${pct(x.pb)}</span>${x.c ? (x.c < PS.CONFIG.MIN_CELL ? '<span>표본 적음</span>' : `<span>${x.gap >= 0 ? '+' : '−'}${Math.abs(x.gap).toFixed(1)}%p</span>`) : ''}` : '<span>응답자 없음</span>'}`;
  tip.hidden = false;
  const cx = (e ? e.clientX : r.left + r.width / 2) - wrap.left, cy = (e ? e.clientY : r.top + r.height / 2) - wrap.top;
  tip.style.left = Math.min(cx + 12, wrap.width - 150) + 'px'; tip.style.top = cy + 12 + 'px';
}
function mapHi(name, on) { const el = document.querySelector(`.map-wrap path[data-r="${CSS.escape(name)}"]`); if (el) on ? mapTip(el) : mapTip(); }
function narrow(v) { drill.attrs.push({ key: segKey, value: v }); render(); window.scrollTo(0, 0); }
function toPersonas() { pf = drillFilters(); pSearch = ''; pPage = 0; respCol = qid; view = 'personas'; render(); window.scrollTo(0, 0); }

/* ---------- 페르소나 (R-26·27·28·29) ---------- */
const chatsOf = (pid) => P().chats[R().id + '::' + pid] || [];
function personaList() {
  const r = R(); if (!respCol || !r.survey.questions.some((q) => q.id === respCol)) respCol = qid;
  let people = PS.filterPeople(r, pf);
  const matched = people.length;
  if (pChatted) people = people.filter((p) => chatsOf(p.id).length);
  const needle = pSearch.trim().toLowerCase();
  if (needle) people = people.filter((p) => [p.id, ...Object.values(p.attributes).map(String), PS.attrValue(p, 'region')].join(' ').toLowerCase().includes(needle));
  const sorters = { id: (p) => p.id, age: (p) => PS.attrValue(p, 'age'), region: (p) => PS.attrValue(p, 'region'), chats: (p) => -chatsOf(p.id).length };
  people.sort((a, b) => String(sorters[pSort](a)).localeCompare(String(sorters[pSort](b)), 'ko', { numeric: true }));
  return { people, matched };
}
/* 검색창은 그대로 두고 결과만 다시 그립니다 (한글 입력 조합이 끊기지 않도록) */
function personaResults() {
  const r = R(), rq = r.survey.questions.find((q) => q.id === respCol), { people } = personaList();
  const per = 15, pages = Math.max(1, Math.ceil(people.length / per)); pPage = Math.min(pPage, pages - 1);
  const shown = people.slice(pPage * per, pPage * per + per);
  return `<div class="table-wrap"><table class="people"><thead><tr><th>페르소나</th><th>연령대·성별</th><th>지역</th><th>직업</th><th>${PS.qLabel(r.survey, rq)} 응답</th><th>대화</th></tr></thead><tbody>
    ${shown.map((p) => { const a = PS.answerOf(r, p.id, rq.id); const n = chatsOf(p.id).length; return `<tr class="click" tabindex="0" onclick="openPersona('${p.id}')" onkeydown="if(event.key==='Enter')openPersona('${p.id}')"><td><b>${p.id}</b></td><td>${esc(PS.attrValue(p, 'age'))} · ${esc(PS.attrValue(p, 'sex'))}</td><td>${esc(PS.attrValue(p, 'region'))} ${esc(PS.districtName(p.attributes.district))}</td><td>${esc(p.attributes.occupation)}</td><td>${rq.type === 'text' ? '<span class="muted">주관식</span>' : esc(PS.answerText(rq, a?.answer))}</td><td>${n ? `<span class="tag info">${n}건</span>` : '<span class="muted">—</span>'}</td></tr>`; }).join('') || '<tr><td colspan="6" class="empty">조건에 맞는 페르소나가 없습니다. 조건이나 검색어를 줄여 보세요.</td></tr>'}
  </tbody></table></div>
  <div class="pager"><button class="small" ${pPage ? '' : 'disabled'} onclick="pPage--;refreshPersonas()">이전</button><span>${pPage + 1} / ${pages}</span><button class="small" ${pPage < pages - 1 ? '' : 'disabled'} onclick="pPage++;refreshPersonas()">다음</button></div>`;
}
function refreshPersonas() { const el = $('#p-results'); if (!el) return render(); el.innerHTML = personaResults(); $('#p-count').textContent = `${personaList().people.length}명 / ${R().people.length}명`; }
function personasView() {
  const r = R(), { people, matched } = personaList();
  return `<section class="card filter-bar"><div class="card-top"><h2>페르소나 <span class="count" id="p-count">${people.length}명 / ${r.people.length}명</span></h2>
      <button class="small" onclick="openPersonaFilter()">+ 조건 추가</button></div>
    ${filterChips(pf, { run: r, empty: '조건 없음 · 이 실행의 응답자 전체' }, 'removePf')}
    <div class="row toolbar"><div class="field grow"><label for="p-search">검색 (입력하면 바로 반영)</label><input id="p-search" value="${esc(pSearch)}" placeholder="ID, 직업, 지역, 소득 등" oninput="pSearch=this.value;pPage=0;refreshPersonas()"></div>
      <div class="field"><label for="p-col">응답 열</label><select id="p-col" onchange="respCol=this.value;render()">${r.survey.questions.map((q) => `<option value="${q.id}" ${q.id === respCol ? 'selected' : ''}>${PS.qLabel(r.survey, q)}</option>`).join('')}</select></div>
      <div class="field"><label for="p-sort">정렬</label><select id="p-sort" onchange="pSort=this.value;render()">${[['id', 'ID 순'], ['age', '연령대 순'], ['region', '지역 순'], ['chats', '대화 많은 순']].map(([k, l]) => `<option value="${k}" ${pSort === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <label class="check"><input type="checkbox" ${pChatted ? 'checked' : ''} onchange="pChatted=this.checked;pPage=0;render()"> 대화한 페르소나만</label></div>
    ${matched < PS.CONFIG.MIN_GROUP && Object.keys(pf).length ? `<p class="warn-text small-text">조건에 맞는 인원이 ${matched}명으로 표본 기준(${PS.CONFIG.MIN_GROUP}명)보다 적습니다.</p>` : ''}</section>
  <section class="card" id="p-results">${personaResults()}</section>`;
}
function openPersonaFilter() { openFilterModal({ mode: 'persona', title: '페르소나 조건', run: R(), filters: pf, start: 'resp:' + qid, onApply: (f) => { pf = f; pPage = 0; render(); } }); }
function removePf(key) { delete pf[key]; pPage = 0; render(); }
function openPersona(id) { personaId = id; view = 'detail'; render(); window.scrollTo(0, 0); }
const person = () => R().people.find((p) => p.id === personaId);
const peopleTrail = (extra = []) => {
  const steps = [{ label: '페르소나 목록', n: PS.filterPeople(R(), pf).length, act: "view='personas';render()" }, ...extra];
  return `<nav class="trail" aria-label="탐색 경로">${steps.map((s, i) => `${i ? '<span class="sep" aria-hidden="true"></span>' : ''}${i === steps.length - 1 ? `<span class="step cur">${esc(s.label)}</span>` : `<button class="step" onclick="${s.act}">${esc(s.label)}${s.n != null ? `<b>${s.n}명</b>` : ''}</button>`}`).join('')}</nav>`;
};
function big5Bars(p) {
  return `<div class="big5">${PS.BIG5.map((k) => { const t = PS.tScore(p.attributes[k]); return `<div class="b5"><span>${esc(PS.attrLabel(k))}</span><div class="b5-track"><i style="left:${((t - 20) / 60) * 100}%"></i></div><span class="b5-v">${t}점 · ${esc(PS.attrValue(p, k))}</span></div>`; }).join('')}</div>`;
}
function profileHtml(p, compact) {
  const keys = compact ? ['age', 'sex', 'region', 'income_bracket'] : ['age', 'sex', 'region', 'marital_status', 'education_level', 'economic_activity_status', 'income_bracket', 'housing_type'];
  return `<dl class="kv">${keys.map((k) => `<div><dt>${esc(PS.attrLabel(k))}</dt><dd>${esc(PS.attrValue(p, k))}${k === 'region' ? ' ' + esc(PS.districtName(p.attributes.district)) : ''}</dd></div>`).join('')}<div><dt>직업</dt><dd>${esc(p.attributes.occupation)}</dd></div></dl>`;
}
function responseItems(p, opts = {}) {
  const r = R();
  return r.survey.questions.map((q) => {
    const a = PS.answerOf(r, p.id, q.id), label = PS.qLabel(r.survey, q);
    const ans = q.type === 'text' ? esc(a?.text || '응답 없음') : `<b>${esc(PS.answerText(q, a?.answer))}</b>${q.type === 'likert' && a ? `<span class="scale">${Array.from({ length: q.scale }, (_, i) => `<i class="${i <= a.answer ? 'f' : ''}"></i>`).join('')}</span><span class="muted small-text">1 ${esc(q.low)} ~ ${q.scale} ${esc(q.high)}</span>` : ''}${a?.otherText ? `<p class="muted small-text">기타 서술: ${esc(a.otherText)}</p>` : ''}`;
    return `<div class="resp ${q.parentId ? 'child' : ''} ${opts.highlight === q.id ? 'hl' : ''}"><div class="resp-top"><b>${label}</b><span class="tag">${PS.TYPE_LABEL[q.type]}</span>${opts.highlight === q.id ? '<span class="tag info">기준 문항</span>' : ''}${opts.ask ? `<button class="link" onclick="chatQid='${q.id}';view='chat';render()">이 응답에 대해 묻기</button>` : ''}</div><p>${esc(q.text)}</p><div class="resp-ans">${ans}</div></div>`;
  }).join('');
}
function detailView() {
  const p = person(); if (!p) { view = 'personas'; return personasView(); }
  return peopleTrail([{ label: p.id }]) + `<div class="page-sub"><h2>${p.id}의 프로필과 응답</h2><button class="primary" onclick="chatQid=null;view='chat';render()">인터뷰${chatsOf(p.id).length ? ` (대화 ${chatsOf(p.id).length}건)` : ''}</button></div>
  <div class="two"><section class="card"><h3>기본 정보</h3>${profileHtml(p)}<h3>성격 (Big5 · T점수)</h3>${big5Bars(p)}
    <details class="all-attrs"><summary>전체 프로필 속성 보기</summary><dl class="kv">${PERSONA_SCHEMA.fields.filter((f) => f.type === 'category' && !PS.BIG5.includes(f.key)).map((f) => `<div><dt>${esc(PS.attrLabel(f.key))}</dt><dd>${esc(f.key === 'region' ? PS.attrValue(p, 'region') : p.attributes[f.key])}</dd></div>`).join('')}</dl></details>
    <p class="muted small-text">가상 시연 프로필 · 실제 사람 자료와 대조하지 않았습니다.</p></section>
  <section class="card"><h3>설문 응답 · 전체 ${R().survey.questions.length}문항</h3>${responseItems(p, { ask: true })}</section></div>`;
}
function suggestions(q) {
  const r = R(), kids = r.survey.questions.filter((x) => x.parentId === q.id);
  return ['그렇게 답한 이유가 궁금해요', q.type === 'likert' ? '어떤 조건이면 점수가 달라질까요?' : '다른 선택지는 왜 고르지 않았나요?', kids.length ? `${PS.qLabel(r.survey, kids[0])} 답과는 어떻게 이어지나요?` : '비슷한 서비스를 써 본 경험이 있나요?'];
}
function chatView() {
  const r = R(), p = person(); if (!p) { view = 'personas'; return personasView(); }
  if (!chatQid || !r.survey.questions.some((q) => q.id === chatQid)) chatQid = qid;
  const q = r.survey.questions.find((x) => x.id === chatQid), msgs = chatsOf(p.id);
  return peopleTrail([{ label: p.id, act: "view='detail';render()" }, { label: '인터뷰' }]) + `<div class="page-sub"><h2>${p.id} 인터뷰</h2></div>
  <div class="two chat-two"><section class="card chat">
    <div class="field"><label for="chat-q">기준 문항 · 이 문항의 응답을 바탕으로 대화합니다</label><select id="chat-q" onchange="chatQid=this.value;render()">${r.survey.questions.map((x) => { const a = PS.answerOf(r, p.id, x.id); return `<option value="${x.id}" ${x.id === chatQid ? 'selected' : ''}>${PS.qLabel(r.survey, x)} · ${esc(x.text.slice(0, 28))}${x.text.length > 28 ? '…' : ''} — ${x.type === 'text' ? '주관식' : esc(PS.answerText(x, a?.answer))}</option>`; }).join('')}</select></div>
    <div class="msgs" aria-live="polite">${msgs.map((m) => `<div class="msg me"><small>나 · 기준 ${esc(PS.qLabel(r.survey, r.survey.questions.find((x) => x.id === m.qid) || q))}</small><p>${esc(m.question)}</p></div><div class="msg"><small>${p.id} · 시연 답변</small><p>${esc(m.answer)}</p></div>`).join('') || '<p class="muted">아래 추천 질문을 누르거나 직접 질문을 입력하세요.</p>'}</div>
    <div class="suggest"><p class="small-text muted">추천 질문</p><div class="row">${suggestions(q).map((s) => `<button class="small" onclick="ask(${JSON.stringify(s).replace(/"/g, '&quot;')})">${esc(s)}</button>`).join('')}</div></div>
    <form class="compose" onsubmit="event.preventDefault();ask($('#chat-in').value)"><label class="sr-only" for="chat-in">질문</label><input id="chat-in" maxlength="500" placeholder="후속 질문을 입력하세요"><button class="primary">보내기</button></form>
    <p class="muted small-text">템플릿 답변 시연 · AI 연결 없음 · 대화는 이 실행과 페르소나에 저장됩니다.</p></section>
  <aside class="card ctx"><h3>대화 맥락</h3>${profileHtml(p, true)}<h3>저장된 응답</h3>${responseItems(p, { highlight: chatQid })}</aside></div>`;
}
function ask(text) {
  text = String(text || '').trim(); if (!text) return;
  const r = R(), p = person(), q = r.survey.questions.find((x) => x.id === chatQid), a = PS.answerOf(r, p.id, q.id);
  const said = q.type === 'text' ? `“${(a?.text || '').slice(0, 40)}…”라고 답했습니다` : q.type === 'likert' ? `${PS.qLabel(r.survey, q)}에 ${a.answer + 1}점(${q.scale}점 척도, ${a.answer + 1 > (q.scale + 1) / 2 ? '동의하는 쪽' : a.answer + 1 < (q.scale + 1) / 2 ? '동의하지 않는 쪽' : '중간'})으로 답했습니다` : `${PS.qLabel(r.survey, q)}에서 “${PS.answerText(q, a.answer)}”를 골랐습니다`;
  const answer = `${said}. 저는 ${PS.attrValue(p, 'age')} ${PS.attrValue(p, 'sex')}이고 ${p.attributes.occupation}로 일하고 있어요. 개방성은 ${PS.attrValue(p, 'openness')}, 성실성은 ${PS.attrValue(p, 'conscientiousness')}인 편이라 그 점이 답에 영향을 줬습니다.`;
  const key = r.id + '::' + p.id; (P().chats[key] = P().chats[key] || []).push({ qid: q.id, question: text, answer, created: new Date().toISOString() });
  touch(); render(); $('#chat-in')?.focus();
}
function exportView() {
  return `<section class="card"><h2>CSV 내보내기</h2><p class="muted">실행 #${R().number} 전체를 내보냅니다. 후속 질문은 q1_1, q1_2처럼 열 이름이 붙습니다.</p>
    <div class="row"><button onclick="downloadCsv('long')">응답 CSV · 세로형</button><button onclick="downloadCsv('wide')">분석 CSV · 가로형</button><button onclick="downloadCsv('codebook')">문항·코드표 CSV</button></div>
    <p class="muted small-text">세로형: 응답 하나가 한 행 · 가로형: 페르소나 한 명이 한 행</p></section>`;
}
function downloadCsv(format) {
  const text = PSCSV.exportCsv(P(), R(), format), url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a'); a.href = url; a.download = `PersonaScope_실행${R().number}_${format}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('CSV를 내려받았습니다.');
}

/* ---------- 시작 ---------- */
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#overlay').innerHTML) closeModal(); });
load(); save(); render();
