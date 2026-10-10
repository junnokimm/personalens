import Modal from '../../components/common/Modal.jsx'
import { TYPE_LABEL, choices, ordered, qLabel } from '../../lib/survey.js'

function PreviewAnswer({ question }) {
  if (question.type === 'text') {
    return <textarea rows={3} disabled placeholder="주관식 응답 영역" aria-label="주관식 응답 영역" />
  }
  return (
    <div className="preview-options">
      {choices(question).map((label, index) => (
        <label className="preview-option" key={`${question.id}:${label}:${index}`}>
          <input type="radio" disabled name={`preview-${question.id}`} />
          <span>{question.type === 'likert' ? index + 1 : label}</span>
        </label>
      ))}
      {question.type === 'likert' ? (
        <div className="preview-scale-labels">
          <span>1 · {question.low}</span>
          <span>{question.scale} · {question.high}</span>
        </div>
      ) : null}
    </div>
  )
}

export default function SurveyPreviewModal({ survey, onClose }) {
  return (
    <Modal onClose={onClose} className="survey-preview" labelledBy="survey-preview-title">
      <div className="modal-head">
        <h2 id="survey-preview-title">설문 미리보기</h2>
        <button className="small" onClick={onClose}>닫기</button>
      </div>
      <div className="preview-survey-head">
        <h1>{survey.title || '제목 없음'}</h1>
        {survey.description ? <p>{survey.description}</p> : null}
        <p className="muted small-text">응답자에게 표시되는 문항 순서입니다. 입력 내용은 저장되지 않습니다.</p>
      </div>
      <div className="preview-questions">
        {ordered(survey).map((question) => {
          const parent = question.parentId ? survey.questions.find((item) => item.id === question.parentId) : null
          return (
            <section className={`preview-question ${parent ? 'child' : ''}`} key={question.id}>
              <div className="preview-question-head">
                <b>{qLabel(survey, question)}</b>
                <span className="tag">{TYPE_LABEL[question.type]}</span>
                {parent ? <span className="tag info">{qLabel(survey, parent)}의 후속 질문</span> : null}
              </div>
              <p>{question.text || '질문 내용 없음'}</p>
              <PreviewAnswer question={question} />
            </section>
          )
        })}
      </div>
      <div className="row end"><button className="primary" onClick={onClose}>미리보기 닫기</button></div>
    </Modal>
  )
}
