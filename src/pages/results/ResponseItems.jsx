import { answerOf } from '../../lib/analysis.js'
import { TYPE_LABEL, answerText, qLabel } from '../../lib/survey.js'

/* 원본 responseItems() — DetailView·ChatView가 함께 쓰는 응답 목록.
 * onAsk가 있으면 각 응답에 "이 응답에 대해 묻기" 버튼이 붙고(DetailView), highlight는 기준 문항 표시(ChatView). */
export default function ResponseItems({ run, person, highlight, onAsk }) {
  return (
    <>
      {run.survey.questions.map((q) => {
        const a = answerOf(run, person.id, q.id)
        const label = qLabel(run.survey, q)
        return (
          <div className={`resp ${q.parentId ? 'child' : ''} ${highlight === q.id ? 'hl' : ''}`} key={q.id}>
            <div className="resp-top">
              <b>{label}</b><span className="tag">{TYPE_LABEL[q.type]}</span>
              {highlight === q.id ? <span className="tag info">기준 문항</span> : null}
              {onAsk ? <button className="link" onClick={() => onAsk(q.id)}>이 응답에 대해 묻기</button> : null}
            </div>
            <p>{q.text}</p>
            <div className="resp-ans">
              {q.type === 'text' ? (a?.text || '응답 없음') : (
                <>
                  <b>{answerText(q, a?.answer)}</b>
                  {q.type === 'likert' && a ? (
                    <>
                      <span className="scale">{Array.from({ length: q.scale }, (_, i) => <i key={i} className={i <= a.answer ? 'f' : ''} />)}</span>
                      <span className="muted small-text">1 {q.low} ~ {q.scale} {q.high}</span>
                    </>
                  ) : null}
                  {a?.otherText ? <p className="muted small-text">기타 서술: {a.otherText}</p> : null}
                </>
              )}
            </div>
          </div>
        )
      })}
    </>
  )
}
