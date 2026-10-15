import { useNavigate, useParams } from 'react-router-dom'

import PageHead from '../../components/common/PageHead.jsx'
import StatusTag from '../../components/common/StatusTag.jsx'
import { retryRun } from '../../store/useSimulationJob.js'
import { useProject } from '../../store/useProjectStore.js'
import { useUiStore } from '../../store/useUiStore.js'
import { stamp } from '../../utils/format.js'

/* 원본 runs() — 결과 › 실행 기록. 같은 프로젝트를 여러 번 실행한 결과를 모아 보고, 하나를 골라 결과로 들어간다 */
export default function RunsPage() {
  const navigate = useNavigate()
  const { projectId } = useParams()
  const project = useProject(projectId)
  const resetResultsUi = useUiStore((s) => s.resetResultsUi)

  function openResult(runId) {
    resetResultsUi(project.runs.find((r) => r.id === runId))
    navigate(`/p/${project.id}/results/${runId}`)
  }

  return (
    <>
      <PageHead title="실행 기록" sub="이 프로젝트에서 실행한 시뮬레이션을 모아 봅니다. 실행을 하나 고르면 문항별 답변·집단별 분석으로 들어갑니다.">
        <button className="primary" onClick={() => navigate(`/p/${project.id}/simulation`)}>새 시뮬레이션</button>
      </PageHead>
      <section className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>실행</th><th>시각</th><th>설문</th><th>대상 집단</th><th>상태</th><th></th></tr>
            </thead>
            <tbody>
              {project.runs.length ? project.runs.map((r) => (
                <tr key={r.id} className={r.status === 'completed' ? 'click' : ''} onClick={r.status === 'completed' ? () => openResult(r.id) : undefined}>
                  <td><b>실행 #{r.number}</b></td>
                  <td>{stamp(r.created)}</td>
                  <td>v{r.survey.version} · {r.survey.questions.length}문항</td>
                  <td>{r.groupName} · {r.people.length}명</td>
                  <td>
                    <StatusTag run={r} />
                    {r.failNote ? <p className="muted small-text">{r.failNote}</p> : null}
                  </td>
                  <td className="right">
                    {r.status === 'completed' ? (
                      <button className="small" onClick={(ev) => { ev.stopPropagation(); openResult(r.id) }}>결과 보기</button>
                    ) : r.status === 'failed' ? (
                      <button className="small" onClick={(ev) => { ev.stopPropagation(); retryRun(project.id, r.id) }}>다시 시도</button>
                    ) : (
                      <span className="progress-mini"><i style={{ width: `${r.progress}%` }} /></span>
                    )}
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={6} className="empty">실행 기록이 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
