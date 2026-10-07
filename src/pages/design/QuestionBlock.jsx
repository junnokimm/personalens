import { TYPE_LABEL, qLabel } from '../../lib/survey.js'
import { useProjectStore } from '../../store/useProjectStore.js'
import { useUiStore } from '../../store/useUiStore.js'
import { useFocusAfterRender } from './useFocusAfterRender.js'

const SCALE_OPTIONS = [3, 5, 7]

/* 원본 qBlock() */
export default function QuestionBlock({ projectId, survey, q, index, siblingCount, errors }) {
  const open = useUiStore((s) => s.openQs.has(q.id))
  const toggleOpenQ = useUiStore((s) => s.toggleOpenQ)
  const editQ = useProjectStore((s) => s.editQ)
  const changeType = useProjectStore((s) => s.changeType)
  const editOpt = useProjectStore((s) => s.editOpt)
  const addOpt = useProjectStore((s) => s.addOpt)
  const delOpt = useProjectStore((s) => s.delOpt)
  const addFollow = useProjectStore((s) => s.addFollow)
  const moveQ = useProjectStore((s) => s.moveQ)
  const deleteQ = useProjectStore((s) => s.deleteQ)
  const openQ = useUiStore((s) => s.openQ)
  const focusAfterRender = useFocusAfterRender()

  const e = errors || {}
  const label = qLabel(survey, q)
  const hasErr = Object.keys(e).length > 0

  function handleAddOpt() {
    const nextIndex = q.options.length
    addOpt(projectId, q.id)
    focusAfterRender(`o-${q.id}-${nextIndex}`)
  }
  function handleAddFollow() {
    const qid = addFollow(projectId, q.id)
    openQ(qid)
    focusAfterRender(`t-${qid}`)
  }

  const head = (
    <div className="q-head">
      <button className="q-toggle" aria-expanded={open} onClick={() => toggleOpenQ(q.id)}>
        <span className="caret">{open ? '▾' : '▸'}</span>
        <b>{label}</b>
        <span className="tag">{TYPE_LABEL[q.type]}</span>
        <span className="q-preview">{q.text || '질문 내용 없음'}</span>
        {hasErr ? <span className="dot-err" title="확인 필요" /> : null}
      </button>
      <div className="q-actions">
        <button className="icon" aria-label={`${label} 위로`} disabled={index === 0} onClick={() => moveQ(projectId, q.id, -1)}>↑</button>
        <button className="icon" aria-label={`${label} 아래로`} disabled={index === siblingCount - 1} onClick={() => moveQ(projectId, q.id, 1)}>↓</button>
        {!q.parentId ? <button className="small" onClick={handleAddFollow}>+ 후속 질문</button> : null}
        <button className="small" onClick={() => deleteQ(projectId, q.id)}>삭제</button>
      </div>
    </div>
  )

  if (!open) {
    return (
      <div className={`q ${q.parentId ? 'child' : ''}`} id={`q-${q.id}`}>
        {q.parentId ? <p className="follow-note">후속 질문</p> : null}
        {head}
      </div>
    )
  }

  const parent = q.parentId ? survey.questions.find((x) => x.id === q.parentId) : null

  return (
    <div className={`q open ${q.parentId ? 'child' : ''}`} id={`q-${q.id}`}>
      {parent ? <p className="follow-note">후속 질문 · {qLabel(survey, parent)}에 이어서 묻습니다</p> : null}
      {head}
      <div className="q-body">
        <div className="field">
          <label htmlFor={`t-${q.id}`}>질문 내용</label>
          <textarea
            id={`t-${q.id}`}
            rows={2}
            className={e.text ? 'invalid' : ''}
            value={q.text}
            onChange={(ev) => editQ(projectId, q.id, 'text', ev.target.value)}
          />
          {e.text ? <p className="err-text">{e.text}</p> : null}
        </div>
        <div className="field narrow">
          <label htmlFor={`ty-${q.id}`}>응답 형식</label>
          <select id={`ty-${q.id}`} value={q.type} onChange={(ev) => changeType(projectId, q.id, ev.target.value)}>
            {Object.entries(TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        {q.type === 'likert' ? (
          <div className="grid3">
            <div className="field">
              <label htmlFor={`sc-${q.id}`}>점수 범위</label>
              <select id={`sc-${q.id}`} value={q.scale} onChange={(ev) => editQ(projectId, q.id, 'scale', Number(ev.target.value))}>
                {SCALE_OPTIONS.map((x) => <option key={x} value={x}>{x}점</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`lo-${q.id}`}>1점 이름</label>
              <input id={`lo-${q.id}`} value={q.low} onChange={(ev) => editQ(projectId, q.id, 'low', ev.target.value)} />
            </div>
            <div className="field">
              <label htmlFor={`hi-${q.id}`}>{q.scale}점 이름</label>
              <input id={`hi-${q.id}`} value={q.high} onChange={(ev) => editQ(projectId, q.id, 'high', ev.target.value)} />
            </div>
          </div>
        ) : null}
        {q.type === 'choice' ? (
          <div className="field">
            <label>선택지</label>
            {q.options.map((o, k) => (
              <div className="opt-row" key={k}>
                <span className="muted">{k + 1}</span>
                <div className="grow">
                  <input
                    id={`o-${q.id}-${k}`}
                    aria-label={`${label} 선택지 ${k + 1}`}
                    value={o}
                    className={e.options?.[k] ? 'invalid' : ''}
                    onChange={(ev) => editOpt(projectId, q.id, k, ev.target.value)}
                  />
                  {e.options?.[k] ? <p className="err-text">{e.options[k]}</p> : null}
                </div>
                <button className="small ghost" disabled={q.options.length <= 2} onClick={() => delOpt(projectId, q.id, k)}>삭제</button>
              </div>
            ))}
            <button className="small ghost" onClick={handleAddOpt}>+ 선택지 추가</button>
            <label className="check">
              <input type="checkbox" checked={q.otherEnabled} onChange={(ev) => editQ(projectId, q.id, 'otherEnabled', ev.target.checked)} />
              기타(직접 입력) 선택지 포함
            </label>
          </div>
        ) : null}
        {e.general ? <p className="err-text">{e.general}</p> : null}
      </div>
    </div>
  )
}
