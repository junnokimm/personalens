/* PersonaScope core — 데이터 모델과 계산 (화면 코드 없음) */
(function (root) {
  const SCHEMA = () => (typeof PERSONA_SCHEMA !== 'undefined' ? PERSONA_SCHEMA : root.PERSONA_SCHEMA);

  /* 회의에서 확정 전까지 쓰는 임시 기준값. 한 곳에서만 바꾸면 전체에 반영됩니다. */
  const CONFIG = {
    MIN_GROUP: 30,      // 이 인원 미만인 집단은 표본 경고
    MIN_CELL: 5,        // 비교 구간 최소 인원 (미만이면 흐리게 + 순위 제외)
    HIGHLIGHT_PP: 10,   // 차이 강조 기준 (%p)
    MIN_PERSONAS: 10,
    MAX_PERSONAS: 500,
  };

  const clone = (x) => JSON.parse(JSON.stringify(x));
  const uid = (p) => p + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  function rng(seed) { let x = (seed >>> 0) || 1; return () => { x = (Math.imul(1664525, x) + 1013904223) >>> 0; return x / 4294967296; }; }
  function hash(str) { let h = 2166136261; for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

  /* ---------- 스키마 속성 ---------- */
  const field = (key) => SCHEMA().fields.find((f) => f.key === key);
  const REGION_NAMES = { '경상남': '경상남도', '경상북': '경상북도', '전라남': '전라남도', '충청남': '충청남도', '충청북': '충청북도' };
  const regionName = (v) => REGION_NAMES[v] || v;
  const districtName = (d) => String(d).replace(/^[^-]+-/, '');
  const BIG5 = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'];
  const BIG5_LEVELS = ['매우 낮음', '낮음', '보통', '높음', '매우 높음'];
  const tScore = (v) => { try { return JSON.parse(v).t_score; } catch { return Number(v); } };
  const big5Level = (v) => { try { return JSON.parse(v).label; } catch { return ''; } };
  function big5Ranges(key) {
    const out = {};
    for (const o of field(key).options) { const t = tScore(o.value), l = big5Level(o.value); out[l] = out[l] ? [Math.min(out[l][0], t), Math.max(out[l][1], t)] : [t, t]; }
    return BIG5_LEVELS.map((label) => ({ label, min: out[label][0], max: out[label][1] }));
  }

  /* 분석(집단 나누기·선택지 비교·페르소나 필터)에 함께 쓰는 속성 목록 — R-03 */
  const ANALYSIS_KEYS = ['sex', 'age', 'region', 'marital_status', 'education_level', 'economic_activity_status', 'income_bracket', 'housing_type', 'housing_tenure', 'bachelors_field', 'smoking_status', 'drinking_status', 'bmi_status', ...BIG5];
  const attrLabel = (key) => (key === 'region' ? '지역(시·도)' : field(key)?.label || key);
  function attrValue(person, key) {
    const v = person.attributes?.[key];
    if (v == null || v === '') return '정보 없음';
    if (BIG5.includes(key)) return big5Level(v) || '정보 없음';
    if (key === 'region') return regionName(v);
    return String(v);
  }
  const numKey = (v) => { if (/해당없음|정보 없음/.test(v)) return 1e9; const n = parseInt(v, 10); return isNaN(n) ? 1e8 : n - (/미만/.test(v) ? 0.5 : 0); };
  function valueOrder(key) {
    if (BIG5.includes(key)) return BIG5_LEVELS;
    const opts = (field(key)?.options || []).map((o) => (key === 'region' ? regionName(o.value) : o.value));
    if (key === 'income_bracket' || key === 'age') return opts.slice().sort((a, b) => numKey(a) - numKey(b));
    return opts;
  }
  function sortValues(key, values) {
    const order = valueOrder(key);
    const idx = (v) => { const i = order.indexOf(v); return i < 0 ? 1e6 + numKey(v) : i; };
    return values.slice().sort((a, b) => idx(a) - idx(b) || String(a).localeCompare(String(b), 'ko'));
  }

  /* 대상 조건(원자료 기준) 인원 추정 — 항목끼리 독립이라고 가정한 근사치 */
  function estimateCount(filters) {
    const total = SCHEMA().total; let ratio = 1, hasText = false;
    for (const [key, values] of Object.entries(filters || {})) {
      if (!values?.length) continue;
      const f = field(key); if (!f) continue;
      if (f.type === 'text') { hasText = true; continue; }
      let sum = 0;
      if (key === 'region') {
        for (const v of values) {
          if (String(v).includes('::')) { const [r, d] = v.split('::'); sum += SCHEMA().regionDistricts.find((x) => x.region === r && x.district === d)?.count || 0; }
          else sum += f.options.find((o) => o.value === v)?.count || 0;
        }
      } else sum = f.options.filter((o) => values.includes(o.value)).reduce((a, o) => a + o.count, 0);
      ratio *= sum / total;
    }
    return { estimate: Math.round(total * ratio), total, hasText };
  }

  /* ---------- 설문 ---------- */
  function question(type = 'choice', parentId = null) {
    return { id: uid('q'), type, parentId, text: '', options: type === 'choice' ? ['선택지 1', '선택지 2'] : [], otherEnabled: false, scale: 5, low: '전혀 그렇지 않다', high: '매우 그렇다' };
  }
  /* 원래 문항 다음에 후속 질문이 오도록 정렬 */
  function ordered(survey) {
    const tops = survey.questions.filter((q) => !q.parentId);
    return tops.flatMap((t) => [t, ...survey.questions.filter((q) => q.parentId === t.id)]);
  }
  /* 번호: 후속 질문이 없으면 Q2, 있으면 Q1-1, Q1-2 … — R-10 */
  function qLabel(survey, q) {
    const tops = survey.questions.filter((x) => !x.parentId);
    const top = q.parentId ? tops.find((t) => t.id === q.parentId) : q;
    const n = tops.indexOf(top) + 1;
    const kids = survey.questions.filter((x) => x.parentId === top.id);
    if (!kids.length) return 'Q' + n;
    return 'Q' + n + '-' + (q.parentId ? kids.indexOf(q) + 2 : 1);
  }
  const qKey = (survey, q) => qLabel(survey, q).toLowerCase().replace('-', '_');
  const TYPE_LABEL = { likert: '척도형', choice: '단일선택', text: '주관식' };

  function choices(q) {
    if (q.type === 'text') return [];
    if (q.type === 'likert') return Array.from({ length: q.scale }, (_, i) => (i + 1) + '점' + (i === 0 ? ' · ' + q.low : i === q.scale - 1 ? ' · ' + q.high : ''));
    return q.otherEnabled ? [...q.options, '기타(직접 입력)'] : q.options.slice();
  }
  /* 응답값 표시 — R-21: "4점 / 5", 선택형은 선택지 이름 */
  function answerText(q, idx) {
    if (!Number.isInteger(idx)) return '응답 없음';
    if (q.type === 'likert') return (idx + 1) + '점 / ' + q.scale;
    return choices(q)[idx] ?? '응답 없음';
  }
  const isOther = (q, idx) => q.type === 'choice' && !!q.otherEnabled && idx === q.options.length;

  function validateSurvey(s) {
    const summary = [], byId = {};
    const add = (q, key, msg) => { byId[q.id] = byId[q.id] || {}; byId[q.id][key] = msg; summary.push({ qid: q.id, msg }); };
    if (!s.title.trim()) summary.push({ qid: null, msg: '설문 주제를 입력하세요.' });
    if (!s.questions.length) summary.push({ qid: null, msg: '문항을 하나 이상 추가하세요.' });
    for (const q of ordered(s)) {
      const label = qLabel(s, q);
      if (!q.text.trim()) add(q, 'text', label + ' 질문 내용을 입력하세요.');
      if (q.type === 'choice') {
        const opts = q.options.map((o) => o.trim()), errs = {};
        opts.forEach((o, i) => { if (!o) errs[i] = '선택지 내용을 입력하세요.'; else if (opts.indexOf(o) !== i) errs[i] = `${opts.indexOf(o) + 1}번 선택지와 같습니다. 다른 이름을 입력하세요.`; });
        if (opts.length < 2) add(q, 'general', label + ' 선택지를 2개 이상 입력하세요.');
        if (Object.keys(errs).length) { byId[q.id] = byId[q.id] || {}; byId[q.id].options = errs; summary.push({ qid: q.id, msg: label + ' 선택지를 확인하세요.' }); }
      }
      if (q.type === 'likert' && (!q.low.trim() || !q.high.trim())) add(q, 'general', label + ' 척도 양끝 이름을 입력하세요.');
    }
    return { summary, byId };
  }
  const surveyError = (s) => validateSurvey(s).summary[0]?.msg || '';
  /* 버전: 편집 중에는 올리지 않고 실행할 때 확정 — N-01 / R-11 */
  const versionText = (s) => (s.draft || !s.version ? 'v' + (s.version + 1) + ' 편집 중' : 'v' + s.version);
  function lockVersion(s) {
    if (s.draft || !s.version) {
      s.version += 1; s.draft = false;
      s.history = s.history || [];
      s.history.push({ version: s.version, created: new Date().toISOString(), title: s.title, description: s.description, questions: clone(s.questions) });
    }
    return s.version;
  }

  /* ---------- 대상 집단 (여러 개 저장) ---------- */
  function group(name = '새 대상 집단') { return { id: uid('group'), name, count: 100, filters: {}, cohort: null }; }
  const groupKey = (g) => JSON.stringify({ count: g.count, filters: g.filters });
  const groupStale = (g) => !g.cohort || g.cohort.builtFrom !== groupKey(g);
  function groupError(g) {
    if (!Number.isInteger(g.count) || g.count < CONFIG.MIN_PERSONAS || g.count > CONFIG.MAX_PERSONAS) return `페르소나 수는 ${CONFIG.MIN_PERSONAS}~${CONFIG.MAX_PERSONAS}명으로 입력하세요.`;
    return '';
  }
  function weightedPicker(entries, rand) {
    const total = entries.reduce((a, e) => a + e.w, 0); const cum = []; let acc = 0;
    for (const e of entries) { acc += e.w; cum.push(acc); }
    return () => { const x = rand() * total; let lo = 0, hi = cum.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < x) lo = m + 1; else hi = m; } return entries[lo].v; };
  }
  /* 시연용 집단 구성: 조건 안에서 원자료 분포(값별 인원) 비율대로 뽑습니다. 실제 레코드 추출이 아닙니다. */
  function buildCohort(g) {
    const err = groupError(g); if (err) throw Error(err);
    const rand = rng(hash(g.id + groupKey(g)));
    const pickers = {};
    for (const f of SCHEMA().fields) {
      if (f.type !== 'category' || f.key === 'region') continue;
      const allowed = g.filters[f.key]?.length ? f.options.filter((o) => g.filters[f.key].includes(o.value)) : f.options;
      pickers[f.key] = weightedPicker(allowed.map((o) => ({ v: o.value, w: o.count || 1 })), rand);
    }
    const sel = g.filters.region || [];
    const districts = SCHEMA().regionDistricts.filter((d) => !sel.length || sel.includes(d.region) || sel.includes(d.region + '::' + d.district));
    const pickDistrict = weightedPicker(districts.map((d) => ({ v: d, w: d.count || 1 })), rand);
    const people = Array.from({ length: g.count }, (_, i) => {
      const attributes = { country: '대한민국' };
      for (const key of Object.keys(pickers)) attributes[key] = pickers[key]();
      const d = pickDistrict(); attributes.region = d.region; attributes.district = d.district;
      for (const f of SCHEMA().fields) if (f.type === 'text') attributes[f.key] = '';
      return { id: 'P-' + String(i + 1).padStart(3, '0'), attributes };
    });
    const textFilters = Object.entries(g.filters).filter(([k, v]) => field(k)?.type === 'text' && v.length).map(([k]) => attrLabel(k));
    g.cohort = { builtFrom: groupKey(g), created: new Date().toISOString(), people, textFiltersIgnored: textFilters };
    return g.cohort;
  }

  /* ---------- 실행 ---------- */
  const DRIVERS = ['age', 'sex', 'income_bracket', 'openness', 'extraversion', 'economic_activity_status', 'region'];
  /* 시연용 응답 생성: 문항마다 2~3개 속성에 따라 선택 확률이 조금씩 달라지게 만든 가짜 응답입니다. */
  function generate(q, person, seed, parentAnswer, parentQ) {
    const n = choices(q).length, rand = rng(hash(seed + person.id + q.id));
    const drivers = DRIVERS.filter((k) => hash(q.id + k) % 3 === 0).slice(0, 3);
    const logits = Array.from({ length: n }, (_, i) => {
      let s = 0;
      for (const k of drivers) s += ((hash(q.id + k + attrValue(person, k) + i) % 1000) / 1000 - 0.5) * 0.7;
      if (q.type === 'likert') s += -Math.pow((i - (n - 1) * 0.55) / n, 2) * 3;
      if (parentQ && Number.isInteger(parentAnswer)) {
        const pn = choices(parentQ).length;
        s += ((hash(q.id + 'p' + parentAnswer + i) % 1000) / 1000 - 0.5) * 2 + (q.type === 'likert' ? -Math.abs(i / (n - 1 || 1) - parentAnswer / (pn - 1 || 1)) * 3 : 0);
      }
      return s;
    });
    const w = logits.map((x) => Math.exp(x)), t = w.reduce((a, b) => a + b, 0);
    let x = rand() * t, i = 0; while (i < n - 1 && (x -= w[i]) > 0) i++;
    return i;
  }
  function textAnswer(q, person) {
    return `${attrValue(person, 'age')} ${attrValue(person, 'sex')}, ${person.attributes.occupation || '직업 정보 없음'}입니다. ` +
      `“${q.text}”에 대해서는 ${attrValue(person, 'income_bracket')} 소득 수준과 개방성 ${attrValue(person, 'openness')} 성향을 고려해 답하겠습니다.`;
  }
  function createRun(p, g) {
    if (surveyError(p.survey)) throw Error(surveyError(p.survey));
    if (groupStale(g)) throw Error(`대상 집단 "${g.name}"을 현재 조건으로 먼저 구성하세요.`);
    const version = lockVersion(p.survey);
    const survey = { title: p.survey.title, description: p.survey.description, version, questions: ordered(p.survey).map(clone) };
    const seed = hash(p.id + version + g.id + g.cohort.created);
    const people = clone(g.cohort.people), responses = [];
    for (const person of people) {
      const given = {};
      for (const q of survey.questions) {
        if (q.type === 'text') { responses.push({ personaId: person.id, questionId: q.id, answer: null, text: textAnswer(q, person) }); continue; }
        const parent = q.parentId ? survey.questions.find((x) => x.id === q.parentId) : null;
        const answer = generate(q, person, seed, parent ? given[parent.id] : null, parent);
        given[q.id] = answer;
        responses.push({ personaId: person.id, questionId: q.id, answer, otherText: isOther(q, answer) ? `${attrValue(person, 'age')} ${attrValue(person, 'sex')} 입장에서 원하는 다른 방식이 있습니다.` : '' });
      }
    }
    return {
      id: uid('run'), number: (p.runs.reduce((m, r) => Math.max(m, r.number || 0), 0) + 1), created: new Date().toISOString(),
      status: 'running', progress: 0, survey, groupId: g.id, groupName: g.name, groupConfig: { count: g.count, filters: clone(g.filters) },
      people, responses, engine: { name: '시연 생성기', version: '3', seed },
    };
  }

  /* ---------- 결과 계산 ---------- */
  function validResponses(r, qid) {
    const q = r.survey.questions.find((x) => x.id === qid), n = choices(q).length, seen = new Set();
    return r.responses.filter((x) => {
      if (x.questionId !== qid || seen.has(x.personaId)) return false;
      if (q.type === 'text' ? !x.text?.trim() : !(Number.isInteger(x.answer) && x.answer >= 0 && x.answer < n)) return false;
      seen.add(x.personaId); return true;
    });
  }
  const answerOf = (r, pid, qid) => r.responses.find((x) => x.personaId === pid && x.questionId === qid);
  function distribution(r, qid) {
    const q = r.survey.questions.find((x) => x.id === qid), rows = validResponses(r, qid);
    return choices(q).map((label, i) => { const count = rows.filter((x) => x.answer === i).length; return { label, count, percent: rows.length ? (count / rows.length) * 100 : 0 }; });
  }
  const responseStats = (r, qid) => { const valid = validResponses(r, qid).length; return { valid, missing: r.people.length - valid }; };
  /* 필터: { key: [값…] } (속성 표시값) + { 'resp:문항id': ['0','2'] } (응답 번호) */
  function matches(r, person, filters) {
    for (const [key, values] of Object.entries(filters)) {
      if (!values?.length) continue;
      if (key.startsWith('resp:')) { const a = answerOf(r, person.id, key.slice(5)); if (!a || !values.includes(String(a.answer))) return false; }
      else if (!values.includes(attrValue(person, key))) return false;
    }
    return true;
  }
  const filterPeople = (r, filters, people = r.people) => people.filter((p) => matches(r, p, filters));
  function breakdown(people, key) {
    const counts = {};
    for (const p of people) { const v = attrValue(p, key); counts[v] = (counts[v] || 0) + 1; }
    return sortValues(key, Object.keys(counts)).map((value) => ({ value, count: counts[value], percent: people.length ? (counts[value] / people.length) * 100 : 0 }));
  }

  /* ---------- 예시 프로젝트 ---------- */
  function sample() {
    const p = { id: uid('project'), name: '구독 서비스 이용 경험 조사', description: '새로운 구독 서비스를 기획하기 전에 이용자의 기대와 선택 기준을 살펴봅니다.', updated: new Date().toISOString(), survey: null, groups: [], activeGroupId: null, runs: [], chats: {} };
    const q1 = { ...question('likert'), text: '나에게 맞는 콘텐츠를 추천해 주는 구독 서비스를 이용하고 싶다.', low: '전혀 동의하지 않음', high: '매우 동의함' };
    const q1b = { ...question('choice', q1.id), text: '방금 그렇게 답한 가장 큰 이유는 무엇인가요?', options: ['시간을 아낄 수 있어서', '새로운 콘텐츠를 찾고 싶어서', '추천을 믿기 어려워서', '개인정보가 걱정돼서'] };
    const q2 = { ...question('choice'), text: '구독 서비스를 선택할 때 가장 중요하게 보는 요소는 무엇인가요?', options: ['가격', '콘텐츠의 다양성', '개인 맞춤 추천', '이용 편의성'] };
    const q3 = { ...question('choice'), text: '새로운 서비스를 어떤 방식으로 경험하고 싶나요?', otherEnabled: true, options: ['무료 체험', '월간 구독', '필요할 때 단건 결제'] };
    p.survey = { title: '일상 속 디지털 구독 서비스', description: '구독 서비스의 이용 의향과 선택 기준을 탐색하기 위한 예시 조사입니다.', version: 0, draft: true, history: [], questions: [q1, q1b, q2, q3] };
    const g1 = { ...group('기본 집단'), count: 120, filters: { age: ['20대', '30대', '40대', '50대', '60대'] } };
    const g2 = { ...group('수도권 20·30대'), count: 80, filters: { age: ['20대', '30대'], region: ['서울', '경기', '인천'] } };
    p.groups = [g1, g2]; p.activeGroupId = g1.id;
    buildCohort(g1); buildCohort(g2);
    const run = createRun(p, g1); run.status = 'completed'; run.progress = 100; p.runs = [run];
    const pid = run.people[1].id;
    p.chats[run.id + '::' + pid] = [{ qid: q1.id, question: '그렇게 답한 이유가 궁금해요', answer: '(시연 대화) 추천이 정확하면 시간을 아낄 수 있을 것 같아 긍정적으로 답했습니다.', created: new Date().toISOString() }];
    return p;
  }

  root.PS = {
    CONFIG, clone, uid, hash, field, regionName, districtName, BIG5, BIG5_LEVELS, big5Ranges, tScore, big5Level,
    ANALYSIS_KEYS, attrLabel, attrValue, sortValues, valueOrder, estimateCount,
    question, ordered, qLabel, qKey, TYPE_LABEL, choices, answerText, isOther, validateSurvey, surveyError, versionText, lockVersion,
    group, groupKey, groupStale, groupError, buildCohort, createRun,
    validResponses, answerOf, distribution, responseStats, matches, filterPeople, breakdown, sample,
  };
})(typeof window !== 'undefined' ? window : globalThis);
