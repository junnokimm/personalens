import { Fragment, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { answerOf } from '../../lib/analysis.js'
import { answerText, qLabel } from '../../lib/survey.js'
import { useProjectStore } from '../../store/useProjectStore.js'
import { useUiStore } from '../../store/useUiStore.js'
import { ProfileCard } from './DetailView.jsx'
import PeopleTrail from './PeopleTrail.jsx'
import PersonasView, { chatsOf } from './PersonasView.jsx'
import ResponseItems from './ResponseItems.jsx'

/* 원본 suggestions() */
function suggestions(run, q) {
  const kids = run.survey.questions.filter((x) => x.parentId === q.id)
  return [
    '그렇게 답한 이유가 궁금해요',
    q.type === 'likert' ? '어떤 조건이면 점수가 달라질까요?' : '다른 선택지는 왜 고르지 않았나요?',
    kids.length ? `${qLabel(run.survey, kids[0])} 답과는 어떻게 이어지나요?` : '비슷한 서비스를 써 본 경험이 있나요?',
  ]
}

/* 원본 chatView()/ask() — 템플릿 답변 시연, AI 연결 없음. 대화는 useProjectStore.ask가 runId::personaId 키로 저장 */
export default function ChatView({ project, run }) {
  const [, setSearchParams] = useSearchParams()
  const personaId = useUiStore((s) => s.personaId)
  const chatQid = useUiStore((s) => s.chatQid)
  const qid = useUiStore((s) => s.qid)
  const pf = useUiStore((s) => s.pf)
  const setResultsUi = useUiStore((s) => s.setResultsUi)
  const askAction = useProjectStore((s) => s.ask)
  const [text, setText] = useState('')
  const inputRef = useRef(null)

  const person = run.people.find((p) => p.id === personaId)
  if (!person) return <PersonasView project={project} run={run} />

  const effectiveChatQid = chatQid && run.survey.questions.some((x) => x.id === chatQid)
    ? chatQid
    : (qid && run.survey.questions.some((x) => x.id === qid) ? qid : run.survey.questions[0].id)
  const q = run.survey.questions.find((x) => x.id === effectiveChatQid)
  const msgs = chatsOf(project, run, person.id)

  function sendAsk(value) {
    const trimmed = String(value || '').trim()
    if (!trimmed) return
    askAction(project.id, run.id, person.id, q.id, trimmed)
    setText('')
    inputRef.current?.focus()
  }

  return (
    <>
      <PeopleTrail
        run={run}
        pf={pf}
        steps={[
          { label: person.id, onClick: () => setSearchParams({ view: 'detail' }) },
          { label: '인터뷰' },
        ]}
      />
      <div className="page-sub"><h2>{person.id} 인터뷰</h2></div>
      <div className="two chat-two">
        <section className="card chat">
          <div className="field">
            <label htmlFor="chat-q">기준 문항 · 이 문항의 응답을 바탕으로 대화합니다</label>
            <select id="chat-q" value={effectiveChatQid} onChange={(ev) => setResultsUi({ chatQid: ev.target.value })}>
              {run.survey.questions.map((x) => {
                const a = answerOf(run, person.id, x.id)
                return (
                  <option key={x.id} value={x.id}>
                    {qLabel(run.survey, x)} · {x.text.slice(0, 28)}{x.text.length > 28 ? '…' : ''} — {x.type === 'text' ? '주관식' : answerText(x, a?.answer)}
                  </option>
                )
              })}
            </select>
          </div>
          <div className="msgs" aria-live="polite">
            {msgs.length ? msgs.map((m, i) => (
              <Fragment key={i}>
                <div className="msg me"><small>나 · 기준 {qLabel(run.survey, run.survey.questions.find((x) => x.id === m.qid) || q)}</small><p>{m.question}</p></div>
                <div className="msg"><small>{person.id} · 시연 답변</small><p>{m.answer}</p></div>
              </Fragment>
            )) : <p className="muted">아래 추천 질문을 누르거나 직접 질문을 입력하세요.</p>}
          </div>
          <div className="suggest">
            <p className="small-text muted">추천 질문</p>
            <div className="row">
              {suggestions(run, q).map((s) => <button key={s} className="small" onClick={() => sendAsk(s)}>{s}</button>)}
            </div>
          </div>
          <form className="compose" onSubmit={(ev) => { ev.preventDefault(); sendAsk(text) }}>
            <label className="sr-only" htmlFor="chat-in">질문</label>
            <input id="chat-in" ref={inputRef} maxLength={500} placeholder="후속 질문을 입력하세요" value={text} onChange={(ev) => setText(ev.target.value)} />
            <button className="primary">보내기</button>
          </form>
          <p className="muted small-text">템플릿 답변 시연 · AI 연결 없음 · 대화는 이 실행과 페르소나에 저장됩니다.</p>
        </section>
        <aside className="card ctx">
          <h3>대화 맥락</h3>
          <ProfileCard person={person} compact />
          <h3>저장된 응답</h3>
          <ResponseItems run={run} person={person} highlight={effectiveChatQid} />
        </aside>
      </div>
    </>
  )
}
