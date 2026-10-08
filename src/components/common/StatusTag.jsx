export default function StatusTag({ run }) {
  if (run.status === 'completed') return <span className="tag ok">완료</span>
  if (run.status === 'failed') return <span className="tag bad">실패</span>
  return (
    <span className="tag run">
      <i className="spin" />진행 중 {run.progress}%
    </span>
  )
}
