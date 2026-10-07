import { useNavigate } from 'react-router-dom'

import StatusTag from '../../components/common/StatusTag.jsx'
import { retryRun } from '../../store/useSimulationJob.js'
import { useUiStore } from '../../store/useUiStore.js'
import { stamp } from '../../utils/format.js'

/* 원본 runRow() — SummaryPage·RunsPage가 공유 */
export default function RunRow({ projectId, run }) {
  const navigate = useNavigate()
  const resetResultsUi = useUiStore((s) => s.resetResultsUi)

  function openResult() {
    resetResultsUi()
    navigate(`/p/${projectId}/results/${run.id}`)
  }

  return (
    <div className="run-row">
      <div>
        <b>실행 #{run.number}</b> <StatusTag run={run} />
        <p className="muted small-text">
          {stamp(run.created)} · 설문 v{run.survey.version} · {run.groupName} {run.people.length}명{run.failNote ? ' · ' + run.failNote : ''}
        </p>
      </div>
      {run.status === 'completed' ? (
        <button className="small" onClick={openResult}>결과 보기</button>
      ) : run.status === 'failed' ? (
        <button className="small" onClick={() => retryRun(projectId, run.id)}>다시 시도</button>
      ) : (
        <span className="progress-mini"><i style={{ width: `${run.progress}%` }} /></span>
      )}
    </div>
  )
}
