import { TYPE_LABEL, qLabel } from '../../lib/survey.js'

/* 원본 questionTabs() — 문항 탭. 후속 질문은 점선(child)으로 표시 */
export default function QuestionTabs({ run, activeQid, onPick }) {
  return (
    <div className="qtabs" role="tablist" aria-label="문항">
      {run.survey.questions.map((q) => (
        <button
          key={q.id}
          role="tab"
          aria-selected={q.id === activeQid}
          className={`${q.id === activeQid ? 'on' : ''} ${q.parentId ? 'child' : ''}`}
          onClick={() => onPick(q.id)}
        >
          {qLabel(run.survey, q)}<small>{TYPE_LABEL[q.type]}</small>
        </button>
      ))}
    </div>
  )
}
