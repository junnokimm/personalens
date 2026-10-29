import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import PageHead from '../../components/common/PageHead.jsx'
import { useProject, useProjectStore } from '../../store/useProjectStore.js'
import { hasRunResults } from '../../lib/runStatus.js'
import { attrValue } from '../../lib/schema.js'
import { ResultUrlProvider, useResultUrl } from './ResultUrlContext.jsx'
import ChatView from './ChatView.jsx'
import DetailView from './DetailView.jsx'

function InterviewContent({ project, run }) {
  const { view, personaId, navigateResult } = useResultUrl()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const answered = new Set(run.responses.map((r) => r.personaId))
  const needle = search.trim().toLowerCase()
  const people = run.people.filter((p) => answered.has(p.id) && [p.id, p.attributes.occupation, p.attributes.region, p.attributes.age].join(' ').toLowerCase().includes(needle))
  const pages = Math.max(1, Math.ceil(people.length / 20)), current = Math.min(page, pages - 1)
  return <>
    <PageHead title="페르소나 추가 인터뷰" sub={`실행 #${run.number}의 저장된 응답과 프로필을 바탕으로 후속 질문을 합니다.`} />
    {personaId ? <>
      <button className="small" onClick={() => navigateResult({ personaId: null, view: 'overall' })}>← 다른 페르소나 선택</button>
      {view === 'detail' ? <DetailView project={project} run={run} /> : <ChatView key={personaId} project={project} run={run} />}
    </> : <section className="card">
      <div className="field"><label htmlFor="interview-search">인터뷰할 페르소나 선택</label>
        <input id="interview-search" placeholder="ID, 직업, 지역, 연령대 검색" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0) }} /></div>
      <div className="people-grid">{people.slice(current * 20, current * 20 + 20).map((p) => <button className="mini" key={p.id} onClick={() => navigateResult({ view: 'chat', personaId: p.id, chatQid: run.responses.find((r) => r.personaId === p.id)?.questionId })}>
        <b>{p.id} · {attrValue(p, 'age')} {attrValue(p, 'sex')}</b><span>{p.attributes.region} · {p.attributes.occupation}</span>
      </button>)}</div>
      {!people.length && <p className="muted">저장된 응답이 있는 페르소나를 찾지 못했습니다.</p>}
      <div className="pager"><button disabled={!current} onClick={() => setPage(current - 1)}>이전</button><span>{current + 1} / {pages} · {people.length.toLocaleString()}명</span><button disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>다음</button></div>
    </section>}
  </>
}

export default function InterviewPage() {
  const { projectId, runId } = useParams()
  const project = useProject(projectId)
  const run = project.runs.find((r) => r.id === runId)
  const loaded = useProjectStore((s) => s.runsLoaded)
  const load = useProjectStore((s) => s.loadRunResult)
  const error = useProjectStore((s) => s.resultErrors?.[runId])
  useEffect(() => { if (run?._server && hasRunResults(run) && !run._loaded) void load(projectId, runId) }, [projectId, runId, run?._loaded, run?._server, load])
  if (!run) return <section className="card">{loaded ? '실행을 찾을 수 없습니다.' : '실행을 불러오는 중…'}</section>
  if (!hasRunResults(run)) return <section className="card">저장된 설문 결과가 나온 뒤 인터뷰할 수 있습니다.</section>
  if (run._server && !run._loaded) return <section className="card" role="status">{error || '저장된 응답을 불러오는 중…'}{error && <button onClick={() => load(projectId, runId)}>다시 불러오기</button>}</section>
  return <ResultUrlProvider run={run}><InterviewContent project={project} run={run} /></ResultUrlProvider>
}
