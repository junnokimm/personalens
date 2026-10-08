import { useSearchParams } from 'react-router-dom'

import { ANALYSIS_KEYS } from '../../lib/schema.js'
import { distribution, responseStats, validResponses } from '../../lib/analysis.js'
import { TYPE_LABEL, qLabel } from '../../lib/survey.js'
import { useUiStore } from '../../store/useUiStore.js'
import { pct } from '../../utils/format.js'
import QuestionTabs from './QuestionTabs.jsx'
import ResponseComparison from './ResponseComparison.jsx'

const shade = (q, i) => (q.type === 'likert' ? 's' + (Math.round((i / (q.scale - 1)) * 4) + 1) : 'sc')

function QuestionHead({ run, q }) {
  const parent = q.parentId ? run.survey.questions.find((x) => x.id === q.parentId) : null
  return (
    <div className="q-title">
      <h2><span className="qno">{qLabel(run.survey, q)}</span>{q.text}</h2>
      <p className="muted small-text">
        {TYPE_LABEL[q.type]}
        {q.type === 'likert' ? ` · ${q.scale}점 척도 (1 = ${q.low}, ${q.scale} = ${q.high})` : ''}
        {parent ? ` · ${qLabel(run.survey, parent)}에 이어서 물은 후속 질문` : ''}
      </p>
    </div>
  )
}

/* 원본 overallView() — qid가 없거나 이 실행의 문항이 아니면(실행을 바꿨을 때) 첫 비주관식 문항을 기본값으로 삼는다 */
export default function OverallView({ run }) {
  const [, setSearchParams] = useSearchParams()
  const qid = useUiStore((s) => s.qid)
  const setResultsUi = useUiStore((s) => s.setResultsUi)

  const effectiveQid = qid && run.survey.questions.some((x) => x.id === qid)
    ? qid
    : (run.survey.questions.find((x) => x.type !== 'text')?.id || run.survey.questions[0].id)
  const q = run.survey.questions.find((x) => x.id === effectiveQid)
  const stats = responseStats(run, q.id)

  function pickQ(id) {
    setResultsUi({ qid: id, drill: { answer: null, attrs: [] } })
    setSearchParams({ view: 'overall' })
  }
  function startSegment(i) {
    setResultsUi({ qid: effectiveQid, drill: { answer: i, attrs: [] }, segKey: ANALYSIS_KEYS[0] })
    setSearchParams({ view: 'segment' })
  }
  function openPersona(personaId) {
    setResultsUi({ personaId })
    setSearchParams({ view: 'detail' })
  }

  if (q.type === 'text') {
    const rows = validResponses(run, q.id)
    return (
      <section className="card">
        <QuestionTabs run={run} activeQid={q.id} onPick={pickQ} />
        <QuestionHead run={run} q={q} />
        <p className="muted small-text">유효 응답 {stats.valid}명 · 누락 {stats.missing}명</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>페르소나</th><th>응답</th></tr></thead>
            <tbody>
              {rows.slice(0, 30).map((a) => (
                <tr key={a.personaId} className="click" tabIndex={0} onClick={() => openPersona(a.personaId)}>
                  <td>{a.personaId}</td><td>{a.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > 30 ? <p className="muted small-text">처음 30개만 표시합니다. 전체는 내보내기에서 받으세요.</p> : null}
      </section>
    )
  }

  const dist = distribution(run, q.id)
  return (
    <>
      <section className="card">
        <QuestionTabs run={run} activeQid={q.id} onPick={pickQ} />
        <QuestionHead run={run} q={q} />
        <div className="dist-head">
          <span>응답 분포 · 유효 {stats.valid}명{stats.missing ? ` · 누락 ${stats.missing}명` : ''}</span>
          <span className="muted small-text">막대를 누르면 그 응답을 고른 사람들을 분석합니다</span>
        </div>
        <div className="answers">
          {dist.map((d, i) => (
            <button key={i} className="answer" onClick={() => startSegment(i)}>
              <span className="a-label">{d.label}</span>
              <span className="a-track"><i className={shade(q, i)} style={{ width: `${d.percent}%` }} /></span>
              <span className="a-pct">{pct(d.percent)}</span>
              <span className="a-n">{d.count}명</span>
              <span className="a-go">집단 분석</span>
            </button>
          ))}
        </div>
        <p className="muted small-text">비율 분모: 유효 응답 {stats.valid}명</p>
      </section>
      <ResponseComparison run={run} q={q} />
    </>
  )
}
