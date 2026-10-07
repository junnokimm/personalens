import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

import PageHead from '../../components/common/PageHead.jsx'
import { useProject } from '../../store/useProjectStore.js'
import { useUiStore } from '../../store/useUiStore.js'
import { stamp } from '../../utils/format.js'
import ChatView from './ChatView.jsx'
import DetailView from './DetailView.jsx'
import OverallView from './OverallView.jsx'
import PersonasView from './PersonasView.jsx'
import SegmentView from './SegmentView.jsx'

/* 원본 results()/openRun() — 실행 정보 띠, 탭 3개, 아래는 view에 따른 화면 */
export default function ResultsPage() {
  const { projectId, runId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const project = useProject(projectId)
  const resetResultsUi = useUiStore((s) => s.resetResultsUi)
  const drill = useUiStore((s) => s.drill)

  const run = project.runs.find((r) => r.id === runId)
  const view = searchParams.get('view') || 'overall'

  function selectRun(id) {
    resetResultsUi(project.runs.find((r) => r.id === id))
    navigate(`/p/${project.id}/results/${id}`)
  }

  if (!run) {
    return (
      <>
        <PageHead title="결과" sub="" />
        <section className="card empty">완료된 실행이 없습니다. <button className="link" onClick={() => navigate(`/p/${project.id}/simulation`)}>시뮬레이션 실행하기</button></section>
      </>
    )
  }
  if (run.status !== 'completed') {
    return (
      <>
        <PageHead title="결과" sub="" />
        <section className="card empty">
          실행 #{run.number}은 {run.status === 'running' ? `진행 중입니다 (${run.progress}%).` : '실패했습니다.'} <button className="link" onClick={() => navigate(`/p/${project.id}/runs`)}>실행 기록 보기</button>
        </section>
      </>
    )
  }

  const done = project.runs.filter((x) => x.status === 'completed')
  const tabGroup = ['overall', 'segment'].includes(view) ? 'overall' : view === 'export' ? 'export' : 'people'
  const tabDefs = [['overall', '전체 결과'], ['people', '페르소나'], ['export', '내보내기']]

  function setView(v) { setSearchParams({ view: v }) }

  return (
    <>
      <PageHead title="결과" sub="응답 분포에서 시작해 세부 집단과 페르소나까지 좁혀 봅니다." />
      <div className="run-strip">
        <label><span>실행</span>
          <select aria-label="실행 선택" value={run.id} onChange={(ev) => selectRun(ev.target.value)}>
            {done.map((x) => <option key={x.id} value={x.id}>실행 #{x.number} · {stamp(x.created)}</option>)}
          </select>
        </label>
        <div><span>설문</span><b>v{run.survey.version} · {run.survey.questions.length}문항</b></div>
        <div><span>대상 집단</span><b>{run.groupName} · {run.people.length}명</b></div>
        <div><span>상태</span><b>합성 응답 · 미검증</b></div>
      </div>
      <div className="tabs" role="tablist">
        {tabDefs.map(([k, l]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tabGroup === k}
            className={tabGroup === k ? 'on' : ''}
            onClick={() => setView(k === 'overall' ? (drill.answer !== null ? 'segment' : 'overall') : k === 'people' ? 'personas' : 'export')}
          >
            {l}
          </button>
        ))}
      </div>
      {view === 'segment' ? <SegmentView run={run} />
        : view === 'personas' ? <PersonasView project={project} run={run} />
        : view === 'export' ? <p className="muted">내보내기 화면은 다음 커밋에서 만듭니다.</p>
        : view === 'detail' ? <DetailView project={project} run={run} />
        : view === 'chat' ? <ChatView project={project} run={run} />
        : <OverallView run={run} />}
    </>
  )
}
