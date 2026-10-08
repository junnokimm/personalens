import { useSearchParams } from 'react-router-dom'

import FilterChips from '../../components/filters/FilterChips.jsx'
import { answerOf, filterPeople } from '../../lib/analysis.js'
import { CONFIG } from '../../lib/config.js'
import { attrValue, districtName } from '../../lib/schema.js'
import { answerText, qLabel } from '../../lib/survey.js'
import { useUiStore } from '../../store/useUiStore.js'

const PER_PAGE = 15
const SORT_OPTIONS = [['id', 'ID 순'], ['age', '연령대 순'], ['region', '지역 순'], ['chats', '대화 많은 순']]

/* 원본 chatsOf() — DetailView·ChatView도 같이 쓴다 */
export const chatsOf = (project, run, personaId) => project.chats[run.id + '::' + personaId] || []

/* 원본 personaList() */
function personaList({ project, run, pf, pChatted, pSearch, pSort }) {
  let people = filterPeople(run, pf)
  const matched = people.length
  if (pChatted) people = people.filter((p) => chatsOf(project, run, p.id).length)
  const needle = pSearch.trim().toLowerCase()
  if (needle) people = people.filter((p) => [p.id, ...Object.values(p.attributes).map(String), attrValue(p, 'region')].join(' ').toLowerCase().includes(needle))
  const sorters = { id: (p) => p.id, age: (p) => attrValue(p, 'age'), region: (p) => attrValue(p, 'region'), chats: (p) => -chatsOf(project, run, p.id).length }
  people = people.slice().sort((a, b) => String(sorters[pSort](a)).localeCompare(String(sorters[pSort](b)), 'ko', { numeric: true }))
  return { people, matched }
}

/* 원본 personasView()/personaResults() — respCol·pPage가 유효하지 않으면(실행을 바꿨을 때)
 * store에 쓰지 않고 표시할 때만 기본값을 계산한다(전환 규칙 2번) */
export default function PersonasView({ project, run }) {
  const [, setSearchParams] = useSearchParams()
  const qid = useUiStore((s) => s.qid)
  const pf = useUiStore((s) => s.pf)
  const pSearch = useUiStore((s) => s.pSearch)
  const pSort = useUiStore((s) => s.pSort)
  const pChatted = useUiStore((s) => s.pChatted)
  const pPage = useUiStore((s) => s.pPage)
  const respCol = useUiStore((s) => s.respCol)
  const setResultsUi = useUiStore((s) => s.setResultsUi)
  const openFilterModal = useUiStore((s) => s.openFilterModal)

  const fallbackQid = () => run.survey.questions.find((q) => q.type !== 'text')?.id || run.survey.questions[0].id
  const effectiveRespCol = respCol && run.survey.questions.some((q) => q.id === respCol) ? respCol : (qid && run.survey.questions.some((q) => q.id === qid) ? qid : fallbackQid())
  const rq = run.survey.questions.find((q) => q.id === effectiveRespCol)
  const { people, matched } = personaList({ project, run, pf, pChatted, pSearch, pSort })
  const pages = Math.max(1, Math.ceil(people.length / PER_PAGE))
  const effectivePPage = Math.min(pPage, pages - 1)
  const shown = people.slice(effectivePPage * PER_PAGE, effectivePPage * PER_PAGE + PER_PAGE)

  function openPersonaFilter() {
    openFilterModal({
      mode: 'persona', title: '페르소나 조건', run, filters: pf, start: 'resp:' + qid,
      onApply: (f) => setResultsUi({ pf: f, pPage: 0 }),
    })
  }
  function removePf(key) {
    const next = { ...pf }; delete next[key]
    setResultsUi({ pf: next, pPage: 0 })
  }
  function openPersona(id) {
    setResultsUi({ personaId: id })
    setSearchParams({ view: 'detail' })
  }

  return (
    <>
      <section className="card filter-bar">
        <div className="card-top">
          <h2>페르소나 <span className="count" id="p-count">{people.length}명 / {run.people.length}명</span></h2>
          <button className="small" onClick={openPersonaFilter}>+ 조건 추가</button>
        </div>
        <FilterChips filters={pf} ctx={{ run, empty: '조건 없음 · 이 실행의 응답자 전체' }} onRemove={removePf} />
        <div className="row toolbar">
          <div className="field grow">
            <label htmlFor="p-search">검색 (입력하면 바로 반영)</label>
            <input id="p-search" value={pSearch} placeholder="ID, 직업, 지역, 소득 등" onChange={(ev) => setResultsUi({ pSearch: ev.target.value, pPage: 0 })} />
          </div>
          <div className="field">
            <label htmlFor="p-col">응답 열</label>
            <select id="p-col" value={effectiveRespCol} onChange={(ev) => setResultsUi({ respCol: ev.target.value })}>
              {run.survey.questions.map((q) => <option key={q.id} value={q.id}>{qLabel(run.survey, q)}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="p-sort">정렬</label>
            <select id="p-sort" value={pSort} onChange={(ev) => setResultsUi({ pSort: ev.target.value })}>
              {SORT_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <label className="check">
            <input type="checkbox" checked={pChatted} onChange={(ev) => setResultsUi({ pChatted: ev.target.checked, pPage: 0 })} /> 대화한 페르소나만
          </label>
        </div>
        {matched < CONFIG.MIN_GROUP && Object.keys(pf).length ? <p className="warn-text small-text">조건에 맞는 인원이 {matched}명으로 표본 기준({CONFIG.MIN_GROUP}명)보다 적습니다.</p> : null}
      </section>
      <section className="card" id="p-results">
        <div className="table-wrap">
          <table className="people">
            <thead><tr><th>페르소나</th><th>연령대·성별</th><th>지역</th><th>직업</th><th>{qLabel(run.survey, rq)} 응답</th><th>대화</th></tr></thead>
            <tbody>
              {shown.length ? shown.map((p) => {
                const a = answerOf(run, p.id, rq.id)
                const n = chatsOf(project, run, p.id).length
                return (
                  <tr key={p.id} className="click" tabIndex={0} onClick={() => openPersona(p.id)} onKeyDown={(ev) => { if (ev.key === 'Enter') openPersona(p.id) }}>
                    <td><b>{p.id}</b></td>
                    <td>{attrValue(p, 'age')} · {attrValue(p, 'sex')}</td>
                    <td>{attrValue(p, 'region')} {districtName(p.attributes.district)}</td>
                    <td>{p.attributes.occupation}</td>
                    <td>{rq.type === 'text' ? <span className="muted">주관식</span> : answerText(rq, a?.answer)}</td>
                    <td>{n ? <span className="tag info">{n}건</span> : <span className="muted">—</span>}</td>
                  </tr>
                )
              }) : <tr><td colSpan={6} className="empty">조건에 맞는 페르소나가 없습니다. 조건이나 검색어를 줄여 보세요.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="pager">
          <button className="small" disabled={!effectivePPage} onClick={() => setResultsUi({ pPage: effectivePPage - 1 })}>이전</button>
          <span>{effectivePPage + 1} / {pages}</span>
          <button className="small" disabled={effectivePPage >= pages - 1} onClick={() => setResultsUi({ pPage: effectivePPage + 1 })}>다음</button>
        </div>
      </section>
    </>
  )
}
