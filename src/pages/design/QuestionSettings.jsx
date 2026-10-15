import { TYPE_LABEL, qLabel } from '../../lib/survey.js'
import { useProjectStore } from '../../store/useProjectStore.js'
import { useFocusAfterRender } from './useFocusAfterRender.js'

const SCALE_OPTIONS = [3, 5, 7]

/* 설문 편집 오른쪽 패널 — 고른 문항 하나의 응답 형식·점수 범위·선택지와 문항 동작(복제·이동·후속 질문·삭제) */
export default function QuestionSettings({ projectId, survey, q, errors, onSelect }) {
  const editQ = useProjectStore((s) => s.editQ)
  const changeType = useProjectStore((s) => s.changeType)
  const editOpt = useProjectStore((s) => s.editOpt)
  const addOpt = useProjectStore((s) => s.addOpt)
  const delOpt = useProjectStore((s) => s.delOpt)
  const addFollow = useProjectStore((s) => s.addFollow)
  const dupQ = useProjectStore((s) => s.dupQ)
  const moveQ = useProjectStore((s) => s.moveQ)
  const deleteQ = useProjectStore((s) => s.deleteQ)
  const focusAfterRender = useFocusAfterRender()

  const e = errors || {}
  const label = qLabel(survey, q)
  const sibs = survey.questions.filter((x) => (x.parentId || null) === (q.parentId || null))
  const index = sibs.indexOf(q)
  const parent = q.parentId ? survey.questions.find((x) => x.id === q.parentId) : null

  function handleAddOpt() {
    const nextIndex = q.options.length
    addOpt(projectId, q.id)
    focusAfterRender(`o-${q.id}-${nextIndex}`)
  }
  function handleAddFollow() {
    const qid = addFollow(projectId, q.id)
    onSelect(qid, true)
  }
  function handleDup() {
    const qid = dupQ(projectId, q.id)
    onSelect(qid, 'select')
  }

  return (
    <aside className="q-settings" aria-label={`${label} 설정`}>
      <div className="qs-head">
        <h3>{label} 설정</h3>
        <div className="row">
          <button className="icon" aria-label={`${label} 위로`} title="위로" disabled={index === 0} onClick={() => moveQ(projectId, q.id, -1)}>↑</button>
          <button className="icon" aria-label={`${label} 아래로`} title="아래로" disabled={index === sibs.length - 1} onClick={() => moveQ(projectId, q.id, 1)}>↓</button>
        </div>
      </div>
      {parent ? <p className="follow-note">후속 질문 · {qLabel(survey, parent)}에 이어서 묻습니다</p> : null}
      <div className="field">
        <label htmlFor={`ty-${q.id}`}>응답 형식</label>
        <select id={`ty-${q.id}`} value={q.type} onChange={(ev) => changeType(projectId, q.id, ev.target.value)}>
          {Object.entries(TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      {q.type === 'likert' ? (
        <>
          <div className="field">
            <label htmlFor={`sc-${q.id}`}>점수 범위</label>
            <select id={`sc-${q.id}`} value={q.scale} onChange={(ev) => editQ(projectId, q.id, 'scale', Number(ev.target.value))}>
              {SCALE_OPTIONS.map((x) => <option key={x} value={x}>{x}점</option>)}
            </select>
          </div>
          <div className="grid2 tight">
            <div className="field">
              <label htmlFor={`lo-${q.id}`}>1점 이름</label>
              <input id={`lo-${q.id}`} value={q.low} onChange={(ev) => editQ(projectId, q.id, 'low', ev.target.value)} />
            </div>
            <div className="field">
              <label htmlFor={`hi-${q.id}`}>{q.scale}점 이름</label>
              <input id={`hi-${q.id}`} value={q.high} onChange={(ev) => editQ(projectId, q.id, 'high', ev.target.value)} />
            </div>
          </div>
        </>
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
              <button className="small ghost" aria-label={`선택지 ${k + 1} 삭제`} disabled={q.options.length <= 2} onClick={() => delOpt(projectId, q.id, k)}>삭제</button>
            </div>
          ))}
          <button className="small ghost" onClick={handleAddOpt}>+ 선택지 추가</button>
          <label className="check">
            <input type="checkbox" checked={q.otherEnabled} onChange={(ev) => editQ(projectId, q.id, 'otherEnabled', ev.target.checked)} />
            기타(직접 입력) 선택지 포함
          </label>
        </div>
      ) : null}
      {q.type === 'text' ? <p className="muted small-text">주관식은 따로 설정할 것이 없습니다.</p> : null}
      {e.general ? <p className="err-text">{e.general}</p> : null}
      <div className="qs-actions">
        <button className="small" onClick={handleDup}>복제</button>
        {!q.parentId ? <button className="small" onClick={handleAddFollow}>+ 후속 질문</button> : null}
        <button className="small" onClick={() => deleteQ(projectId, q.id)}>삭제</button>
      </div>
    </aside>
  )
}
