export default function StatusTag({ run }) {
  if (run.status === 'completed') return <span className="tag ok">완료</span>
  if (run.status === 'failed') return <span className="tag bad">실패</span>
  if (run.status === 'queued') return <span className="tag info">대기 중 · {run.progress}%</span>
  if (run.status === 'partial_failed') return <span className="tag warn">일부 실패</span>
  if (run.status === 'cancelled') return <span className="tag">취소됨</span>
  return (
    <span className="tag run">
      <i className="spin" />진행 중 {run.progress}%
    </span>
  )
}
