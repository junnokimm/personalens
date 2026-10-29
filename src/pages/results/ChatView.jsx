import { Fragment, useRef, useState } from 'react'

import { answerOf } from '../../lib/analysis.js'
import { answerText, qLabel } from '../../lib/survey.js'
import { useProjectStore } from '../../store/useProjectStore.js'
import { useUiStore } from '../../store/useUiStore.js'
import { ProfileCard } from './DetailView.jsx'
import PeopleTrail from './PeopleTrail.jsx'
import PersonasView, { chatsOf } from './PersonasView.jsx'
import { useResultUrl } from './ResultUrlContext.jsx'
import { drillFilters } from './resultUrlState.js'
import ResponseItems from './ResponseItems.jsx'
import { pendingInterview, useInterview, useInterviewStore } from '../../store/useInterviewStore.js'
import { engineLabel } from '../../lib/execution.js'

/* 원본 suggestions() */
function suggestions(run, q) {
  const kids = run.survey.questions.filter((x) => x.parentId === q.id)
  return [
    '그렇게 답한 이유가 궁금해요',
    q.type === 'likert' ? '어떤 조건이면 점수가 달라질까요?' : '다른 선택지는 왜 고르지 않았나요?',
    kids.length ? `${qLabel(run.survey, kids[0])} 답과는 어떻게 이어지나요?` : '비슷한 서비스를 써 본 경험이 있나요?',
  ]
}

/* Server runs persist interview turns in the DB; legacy demos keep their local chat. */
export default function ChatView({ project, run }) {
  const { qid, drill, personaId, chatQid, navigateResult } = useResultUrl()
  const pf = useUiStore((s) => s.pf)
  const askAction = useProjectStore((s) => s.ask)
  const [text, setText] = useState(() => run._server ? pendingInterview(run.id, personaId)?.question || '' : '')
  const inputRef = useRef(null)

  const person = run.people.find((p) => p.id === personaId)
  const thread = useInterview(run.id, person?.id, !!run._server)
  const send = useInterviewStore((s) => s.send)
  const act = useInterviewStore((s) => s.action)
  if (!person) return <PersonasView project={project} run={run} />

  const effectiveChatQid = chatQid && run.survey.questions.some((x) => x.id === chatQid)
    ? chatQid
    : (qid && run.survey.questions.some((x) => x.id === qid) ? qid : run.survey.questions[0].id)
  const q = run.survey.questions.find((x) => x.id === effectiveChatQid)
  const msgs = run._server ? thread.turns : chatsOf(project, run, person.id)
  const busy = run._server && (thread.sending || thread.pending || !thread.loaded)
  const urlFilters = drillFilters(qid, drill)
  const effectivePf = Object.keys(urlFilters).length ? urlFilters : pf

  async function sendAsk(value) {
    const trimmed = String(value || '').trim()
    if (!trimmed) return
    if (busy) return
    if (run._server) {
      if (!await send(run.id, person.id, q.id, trimmed)) return
    } else askAction(project.id, run.id, person.id, q.id, trimmed)
    setText('')
    inputRef.current?.focus()
  }

  return (
    <>
      <PeopleTrail
        run={run}
        pf={effectivePf}
        steps={[
          { label: person.id, onClick: () => navigateResult({ view: 'detail' }) },
          { label: '인터뷰' },
        ]}
      />
      <div className="page-sub"><h2>{person.id} 인터뷰</h2></div>
      <div className="two chat-two">
        <section className="card chat">
          <div className="field">
            <label htmlFor="chat-q">기준 문항 · 이 문항의 응답을 바탕으로 대화합니다</label>
            <select id="chat-q" value={effectiveChatQid} onChange={(ev) => navigateResult({ chatQid: ev.target.value })}>
              {run.survey.questions.map((x) => {
                const a = answerOf(run, person.id, x.id)
                return (
                  <option key={x.id} value={x.id} disabled={run._server && !a}>
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
                <div className="msg"><small>{person.id} · {run._server ? engineLabel(run) : '시연 답변'}</small>
                  <p>{m.answer || ({ queued: '답변 대기 중…', running: '답변 생성 중…', failed: m.error, cancelled: '답변 생성을 취소했습니다.' }[m.status])}</p>
                  {m.status === 'failed' && m.usage.attempts < 3 && i === msgs.length - 1 && <button className="small" disabled={thread.sending} onClick={() => act(run.id, person.id, m.id, 'retry')}>답변 재시도</button>}
                  {['queued', 'running'].includes(m.status) && <button className="small" disabled={thread.sending} onClick={() => act(run.id, person.id, m.id, 'cancel')}>답변 생성 취소</button>}
                </div>
              </Fragment>
            )) : <p className="muted">{run._server && !thread.loaded ? '저장된 인터뷰를 불러오는 중…' : '아래 추천 질문을 누르거나 직접 질문을 입력하세요.'}</p>}
          </div>
          {thread.error && <p className="err-text" role="alert">{thread.error}</p>}
          <div className="suggest">
            <p className="small-text muted">추천 질문</p>
            <div className="row">
              {suggestions(run, q).map((s) => <button key={s} className="small" disabled={busy} onClick={() => sendAsk(s)}>{s}</button>)}
            </div>
          </div>
          <form className="compose" onSubmit={(ev) => { ev.preventDefault(); sendAsk(text) }}>
            <label className="sr-only" htmlFor="chat-in">질문</label>
            <input id="chat-in" ref={inputRef} maxLength={2000} placeholder="후속 질문을 입력하세요" value={text} onChange={(ev) => setText(ev.target.value)} />
            <button className="primary" disabled={busy || !text.trim()}>{busy ? '답변 대기 중' : '보내기'}</button>
          </form>
          <p className="muted small-text">{run._server
            ? `${engineLabel(run)} · 대화는 DB에 저장됩니다. 실행 당시 프로필·설문 응답과 최근 10회 대화를 참고합니다.${run.engine?.kind === 'openai' && !run.engine.mock ? ' 질문을 보내면 해당 연결로 API가 호출됩니다.' : ''}`
            : '템플릿 답변 시연 · AI 연결 없음 · 이 브라우저에 저장됩니다.'}</p>
          {thread.pending && <p className="muted small-text">화면을 닫아도 서버에서 처리합니다. 취소해도 이미 전송한 호출은 과금될 수 있습니다.</p>}
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
