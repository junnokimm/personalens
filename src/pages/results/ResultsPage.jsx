import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import PageHead from '../../components/common/PageHead.jsx'
import { SERVER_STORAGE, useProject, useProjectStore } from '../../store/useProjectStore.js'
import { hasRunResults, isRunActive } from '../../lib/runStatus.js'
import { useUiStore } from '../../store/useUiStore.js'
import { josa, stamp } from '../../utils/format.js'
import ChatView from './ChatView.jsx'
import DetailView from './DetailView.jsx'
import ExportView from './ExportView.jsx'
import OverallView from './OverallView.jsx'
import PersonasView from './PersonasView.jsx'
import { ResultUrlProvider, useResultUrl } from './ResultUrlContext.jsx'
import { RESULT_SECTIONS, resultSectionOf, resultSectionUrl } from './resultLinks.js'
import SegmentView from './SegmentView.jsx'

const SECTION_SUB = {
  answers: '문항마다 응답 분포를 보고, 선택지별로 어떤 사람들이 답했는지 비교합니다.',
  segment: '한 응답을 고른 사람들을 속성별로 나눠 보고, 그 집단의 페르소나까지 좁혀 봅니다.',
}

function CompletedResults({ project, run, done, onSelectRun }) {
  const { view, drill, navigateResult } = useResultUrl()
  const section = resultSectionOf('results', view)
  const title = view === 'export' ? '내보내기' : RESULT_SECTIONS.find((s) => s.key === section)?.label || '결과'

  /* 집단별 분석 안의 두 화면 — 집단 나누기(응답 하나 기준)와 페르소나 목록 */
  const segTab = view === 'segment' ? 'split' : 'people'
  function openSegTab(key) {
    if (key === 'people') navigateResult({ view: 'personas', personaId: null, chatQid: null })
    else navigateResult({ view: drill.answer !== null ? 'segment' : 'overall', personaId: null, chatQid: null })
  }

  return (
    <>
      <PageHead title={title} sub={SECTION_SUB[section] || ''}>
        {view === 'export' ? null : <button onClick={() => navigateResult({ view: 'export', personaId: null, chatQid: null })}>CSV 내보내기</button>}
      </PageHead>
      <div className="run-strip">
        <label><span>실행</span>
          <select aria-label="실행 선택" value={run.id} onChange={(ev) => onSelectRun(ev.target.value, section)}>
            {done.map((x) => <option key={x.id} value={x.id}>실행 #{x.number} · {stamp(x.created)}</option>)}
          </select>
        </label>
        <div><span>설문</span><b>v{run.survey.version} · {run.survey.questions.length}문항</b></div>
        <div><span>대상 집단</span><b>{run.groupName} · {run.people.length}명</b></div>
        <div><span>상태</span><b>합성 응답 · 미검증</b></div>
      </div>
      <div className={`banner ${run.status === 'completed' ? 'info' : 'warn'}`}>
        <span>{run._server ? '서버 시연 응답 · 실제 모델 미연결 · 실행 시점의 설계 기준' : '이전 로컬 시연 응답 · 이 브라우저에만 저장됨'}
          {run.status !== 'completed' ? ` · ${run.people.length * run.survey.questions.length}개 중 ${run.responses.length}개 응답만 표시합니다. 미응답을 해석에 유의하세요.` : ''}</span>
      </div>
      {section === 'segment' ? (
        <div className="tabs" role="tablist" aria-label="집단별 분석 보기">
          {[['split', '집단 나누기'], ['people', '페르소나 목록']].map(([k, l]) => (
            <button key={k} role="tab" aria-selected={segTab === k} className={segTab === k ? 'on' : ''} disabled={k === 'split' && drill.answer === null} onClick={() => openSegTab(k)}>{l}</button>
          ))}
        </div>
      ) : null}
      {view === 'segment' ? <SegmentView run={run} />
        : view === 'personas' ? <PersonasView project={project} run={run} />
        : view === 'export' ? <ExportView project={project} run={run} />
        : view === 'detail' ? <DetailView project={project} run={run} />
        : view === 'chat' ? <ChatView project={project} run={run} />
        : <OverallView run={run} />}
    </>
  )
}

/* 원본 results()/openRun() — 실행 하나의 결과. 관점(문항별 답변·집단별 분석)은 사이드바 결과 하위 메뉴에서 고른다 */
export default function ResultsPage() {
  const { projectId, runId } = useParams()
  const navigate = useNavigate()
  const project = useProject(projectId)
  const resetResultsUi = useUiStore((s) => s.resetResultsUi)
  const runsLoaded = useProjectStore((s) => s.runsLoaded)
  const runsError = useProjectStore((s) => s.runsError)
  const loadResult = useProjectStore((s) => s.loadRunResult)
  const resultError = useProjectStore((s) => s.resultErrors?.[runId])
  const run = project.runs.find((item) => item.id === runId)
  const done = project.runs.filter(hasRunResults)
  useEffect(() => {
    if (run?._server && hasRunResults(run) && !run._loaded) void loadResult(projectId, runId)
  }, [projectId, runId, run?._server, run?._loaded, run?.updated, loadResult])

  /* 실행을 바꿔도 보던 관점(문항별 답변·집단별 분석)은 유지한다 */
  function selectRun(id, section) {
    const next = project.runs.find((item) => item.id === id)
    resetResultsUi(next)
    navigate(section ? resultSectionUrl(project.id, next, section) : `/p/${project.id}/results/${id}`)
  }

  if (SERVER_STORAGE && (!runsLoaded || runsError)) return <section className="card" role="status">{runsError || '실행 기록을 불러오는 중입니다…'}</section>
  if (!run) {
    return (
      <>
        <PageHead title="결과" sub="" />
        <section className="card empty">
          이 실행을 찾을 수 없습니다.
          {done.length ? <> <button className="link" onClick={() => selectRun(done[0].id)}>최근 결과 보기</button></> : null}
          {' '}<button className="link" onClick={() => navigate(`/p/${project.id}/results`)}>실행 기록 보기</button>
        </section>
      </>
    )
  }
  if (!hasRunResults(run)) {
    return (
      <>
        <PageHead title="결과" sub="" />
        <section className="card empty">
          실행 #{run.number}{josa(run.number, ['은', '는'])} {isRunActive(run) ? `${run.status === 'queued' ? '워커 처리 대기 중' : '진행 중'}입니다 (${run.progress}%).` : run.status === 'cancelled' ? '취소되었습니다.' : '실패했습니다.'} <button className="link" onClick={() => navigate(`/p/${project.id}/results`)}>실행 기록 보기</button>
        </section>
      </>
    )
  }

  if (run._server && !run._loaded) return <section className="card" role="status">
    {resultError || 'DB에서 응답과 페르소나를 불러오는 중입니다…'}
    {resultError ? <button onClick={() => loadResult(projectId, runId)}>다시 불러오기</button> : null}
  </section>

  return (
    <ResultUrlProvider run={run}>
      <CompletedResults project={project} run={run} done={done} onSelectRun={selectRun} />
    </ResultUrlProvider>
  )
}
