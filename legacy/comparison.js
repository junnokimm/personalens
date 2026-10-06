/* 선택지별 응답자 비교 — R-20 */
let CMP = { key: '', a: 0, b: 1, attr: '', showAll: false };

function compareRows(A, B, key) {
  const values = PS.sortValues(key, [...new Set([...A, ...B].map((p) => PS.attrValue(p, key)))]);
  return values.map((value) => {
    const ca = A.filter((p) => PS.attrValue(p, key) === value).length, cb = B.filter((p) => PS.attrValue(p, key) === value).length;
    const pa = A.length ? (ca / A.length) * 100 : 0, pb = B.length ? (cb / B.length) * 100 : 0;
    return { value, ca, cb, pa, pb, gap: pa - pb, small: Math.max(ca, cb) < PS.CONFIG.MIN_CELL };
  });
}
function topAttributes(A, B) {
  return PS.ANALYSIS_KEYS.map((key) => {
    const rows = compareRows(A, B, key).filter((r) => !r.small && !['정보 없음', '해당없음'].includes(r.value));
    const best = rows.sort((x, y) => Math.abs(y.gap) - Math.abs(x.gap))[0];
    return best ? { key, ...best } : null;
  }).filter(Boolean).sort((x, y) => Math.abs(y.gap) - Math.abs(x.gap));
}
const gapText = (g) => (Math.abs(g) < 0.05 ? '차이 없음' : `${g > 0 ? 'A' : 'B'}에서 ${Math.abs(g).toFixed(1)}%p 높음`);
const gapBadge = (g) => `<span class="gap ${Math.abs(g) >= PS.CONFIG.HIGHLIGHT_PP ? 'strong' : ''} ${g >= 0 ? 'ga' : 'gb'}">${g >= 0 ? '+' : '−'}${Math.abs(g).toFixed(1)}%p</span>`;

function pairBars(pa, pb) {
  return `<div class="pair"><i class="pa" style="width:${pa}%"></i></div><div class="pair"><i class="pb" style="width:${pb}%"></i></div>`;
}

function responseComparison(r, q) {
  const key = r.id + ':' + q.id, labels = PS.choices(q);
  if (CMP.key !== key) {
    const dist = PS.distribution(r, q.id).map((d, i) => ({ i, c: d.count })).sort((x, y) => y.c - x.c);
    CMP = { key, a: dist[0]?.i ?? 0, b: dist[1]?.i ?? 1, attr: '', showAll: false };
  }
  const A = PS.filterPeople(r, { ['resp:' + q.id]: [String(CMP.a)] }), B = PS.filterPeople(r, { ['resp:' + q.id]: [String(CMP.b)] });
  const total = r.people.length;
  const sel = (id, which, other) => `<label class="cmp-pick ${which}"><span>${which === 'a' ? 'A' : 'B'}</span>
    <select id="${id}" aria-label="비교 집단 ${which.toUpperCase()}" onchange="CMP.${which}=Number(this.value);CMP.attr='';CMP.showAll=false;render()">
    ${labels.map((l, i) => `<option value="${i}" ${i === CMP[which] ? 'selected' : ''} ${i === other ? 'disabled' : ''}>${esc(l)} (${PS.filterPeople(r, { ['resp:' + q.id]: [String(i)] }).length}명)</option>`).join('')}</select></label>`;
  const head = `<section class="card cmp"><div class="card-top"><div><h2>선택지별 응답자 비교</h2><p class="muted small-text">두 선택지를 고른 사람들이 어떤 속성에서 다른지 보여 줍니다. 합성 응답 기준입니다.</p></div></div>
    <div class="cmp-picks">${sel('cmp-a', 'a', CMP.b)}${sel('cmp-b', 'b', CMP.a)}</div>
    <div class="cmp-sizes">
      <div class="size a"><b>A · ${A.length}명</b><span>전체 ${total}명 중 ${(A.length / total * 100).toFixed(1)}%</span></div>
      <div class="size b"><b>B · ${B.length}명</b><span>전체 ${total}명 중 ${(B.length / total * 100).toFixed(1)}%</span></div>
    </div>`;
  if (!A.length || !B.length) return head + '<p class="empty">응답자가 없는 선택지가 있어 비교할 수 없습니다.</p></section>';
  const warn = A.length < PS.CONFIG.MIN_GROUP || B.length < PS.CONFIG.MIN_GROUP
    ? `<div class="banner warn">비교 집단이 ${PS.CONFIG.MIN_GROUP}명 미만입니다. 차이는 참고용으로만 보세요. ${PS.CONFIG.MIN_CELL}명 미만인 구간은 흐리게 표시하고 순위 계산에서 뺍니다.</div>` : '';
  const tops = topAttributes(A, B);
  const top3 = tops.slice(0, 3);
  if (!CMP.attr) CMP.attr = top3[0]?.key || 'age';
  const cards = top3.length ? `<h3 class="sub-h">차이가 큰 속성 ${top3.length}개 <small>분석용 속성 ${PS.ANALYSIS_KEYS.length}개 중</small></h3>
    <div class="top3">${top3.map((t) => `<button class="top-card ${CMP.attr === t.key ? 'on' : ''}" onclick="CMP.attr='${t.key}';CMP.showAll=false;render()">
      <span class="t-head"><b>${esc(PS.attrLabel(t.key))}</b>${gapBadge(t.gap)}</span>
      <span class="t-line">${esc(t.value)} 비율이 ${gapText(t.gap)}</span>
      <span class="t-bars"><span class="lab">A</span><div class="pair"><i class="pa" style="width:${t.pa}%"></i></div><span class="num">${t.pa.toFixed(1)}%</span></span>
      <span class="t-bars"><span class="lab">B</span><div class="pair"><i class="pb" style="width:${t.pb}%"></i></div><span class="num">${t.pb.toFixed(1)}%</span></span>
    </button>`).join('')}</div>`
    : '<p class="muted">표본 기준을 넘는 구간이 없어 차이 순위를 계산하지 않았습니다.</p>';
  const rows = compareRows(A, B, CMP.attr);
  const LIMIT = 8;
  let shown = rows;
  if (!CMP.showAll && rows.length > LIMIT) {
    const big = rows.filter((x) => !x.small);
    const keep = new Set((big.length > LIMIT ? big.slice().sort((x, y) => Math.abs(y.gap) - Math.abs(x.gap)).slice(0, LIMIT) : big).map((x) => x.value));
    shown = rows.filter((x) => keep.has(x.value));
  }
  const chart = `<div class="cmp-detail"><div class="cmp-detail-head"><label for="cmp-attr">속성 직접 고르기</label>
      <select id="cmp-attr" onchange="CMP.attr=this.value;CMP.showAll=false;render()">${PS.ANALYSIS_KEYS.map((k) => `<option value="${k}" ${k === CMP.attr ? 'selected' : ''}>${esc(PS.attrLabel(k))}</option>`).join('')}</select>
      <span class="legend"><i class="pa"></i>A <i class="pb"></i>B</span></div>
    <div class="cmp-rows">${shown.map((x) => `<div class="cmp-row ${x.small ? 'small' : ''}"><span class="v">${esc(x.value)}</span><span class="bars">${pairBars(x.pa, x.pb)}</span>
      <span class="n">A ${x.pa.toFixed(1)}% <small>(${x.ca})</small> · B ${x.pb.toFixed(1)}% <small>(${x.cb})</small></span>
      <span class="g">${x.small ? '<span class="tag">표본 적음</span>' : gapBadge(x.gap)}</span></div>`).join('')}</div>
    ${rows.length > shown.length ? `<button class="link" onclick="CMP.showAll=true;render()">표본이 적은 구간 포함 전체 ${rows.length}개 구간 보기</button>` : CMP.showAll && rows.length > LIMIT ? `<button class="link" onclick="CMP.showAll=false;render()">차이가 큰 구간만 보기</button>` : ''}
    </div>`;
  return head + warn + cards + chart + `<p class="muted small-text foot-note">기준: 구간 인원 ${PS.CONFIG.MIN_CELL}명 미만은 순위에서 제외 · ${PS.CONFIG.HIGHLIGHT_PP}%p 이상 차이는 진하게 표시 · 차이는 두 집단 안의 비율 차이(%p)입니다.</p></section>`;
}
