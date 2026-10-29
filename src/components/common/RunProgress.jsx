import { runProgress } from '../../lib/runProgress.js'
import { canRetryRun, hasRunResults, isRunActive } from '../../lib/runStatus.js'
import { cancelRun, retryRun } from '../../store/useSimulationJob.js'
import { useProjectStore } from '../../store/useProjectStore.js'

const LABEL = { queued: '처리 대기 중', running: '응답 생성 중', completed: '완료', partial_failed: '일부 실패', failed: '실패', cancelled: '취소됨' }

export default function RunProgress({ projectId, run, openResult }) {
  const busy = useProjectStore((s) => !!s.actingRuns?.[run.id])
  const { total, succeeded, failed, remaining, percent } = runProgress(run)
  const active = isRunActive(run)
  return <div className="run-progress-panel">
    <div className="card-top"><h3>실행 #{run.number} · {LABEL[run.status]}</h3><b>{percent}%</b></div>
    <p className="muted small-text">{run.groupName} · 실행 시점의 설문 {run.survey.questions.length}문항</p>
    <div className="run-progress-track" role="progressbar" aria-label="시뮬레이션 처리율" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
      aria-valuetext={`${percent}% 처리 · 저장 완료 ${succeeded}개 · 실패 및 건너뜀 ${failed}개`}>
      <span className="run-progress-success" style={{ width: `${total ? succeeded * 100 / total : 0}%` }} />
      <span className="run-progress-failed" style={{ width: `${total ? failed * 100 / total : 0}%` }} />
    </div>
    <p className="small-text" role="status">전체 {total.toLocaleString()}개 · 저장 완료 {succeeded.toLocaleString()}개 · 실패·건너뜀 {failed.toLocaleString()}개 · {run.status === 'cancelled' ? '중단' : '대기·처리 중'} {remaining.toLocaleString()}개</p>
    {active && <p className="muted small-text">{run._server ? '서버 처리 건수를 약 2초마다 갱신합니다. 브라우저를 닫아도 계속됩니다.' : '브라우저 시연 진행률입니다.'}</p>}
    {run.failNote && <p className="err-text">{run.failNote}</p>}
    <div className="row">
      {hasRunResults(run) && <button className="primary" onClick={() => openResult(run)}>{run.status === 'completed' ? '결과 확인하러 가기' : '저장된 결과 보기'}</button>}
      {canRetryRun(run) && <button disabled={busy} onClick={() => retryRun(projectId, run.id)}>실패한 응답만 재시도</button>}
      {active && run._server && <button disabled={busy} onClick={() => cancelRun(projectId, run.id)}>실행 취소</button>}
    </div>
    {active && run.engine?.kind === 'openai' && <p className="muted small-text">취소하면 저장된 응답은 보존됩니다. 이미 전송한 요청은 과금될 수 있습니다.</p>}
  </div>
}
