import personaSchema from '../../data/personaSchema.json'
import { attrLabel, attrValue, BIG5, districtName, tScore } from '../../lib/schema.js'
import { useUiStore } from '../../store/useUiStore.js'
import PersonasView, { chatsOf } from './PersonasView.jsx'
import PeopleTrail from './PeopleTrail.jsx'
import { useResultUrl } from './ResultUrlContext.jsx'
import { drillFilters } from './resultUrlState.js'
import ResponseItems from './ResponseItems.jsx'

/* 원본 big5Bars() */
export function Big5Bars({ person }) {
  return (
    <div className="big5">
      {BIG5.map((k) => {
        const t = tScore(person.attributes[k])
        return (
          <div className="b5" key={k}>
            <span>{attrLabel(k)}</span>
            <div className="b5-track"><i style={{ left: `${((t - 20) / 60) * 100}%` }} /></div>
            <span className="b5-v">{t}점 · {attrValue(person, k)}</span>
          </div>
        )
      })}
    </div>
  )
}

/* 원본 profileHtml() */
export function ProfileCard({ person, compact }) {
  const keys = compact
    ? ['age', 'sex', 'region', 'income_bracket']
    : ['age', 'sex', 'region', 'marital_status', 'education_level', 'economic_activity_status', 'income_bracket', 'housing_type']
  return (
    <dl className="kv">
      {keys.map((k) => (
        <div key={k}><dt>{attrLabel(k)}</dt><dd>{attrValue(person, k)}{k === 'region' ? ' ' + districtName(person.attributes.district) : ''}</dd></div>
      ))}
      <div><dt>직업</dt><dd>{person.attributes.occupation}</dd></div>
    </dl>
  )
}

/* 원본 detailView() */
export default function DetailView({ project, run }) {
  const { qid, drill, personaId, navigateResult } = useResultUrl()
  const pf = useUiStore((s) => s.pf)
  const urlFilters = drillFilters(qid, drill)
  const effectivePf = Object.keys(urlFilters).length ? urlFilters : pf

  const person = run.people.find((p) => p.id === personaId)
  if (!person) return <PersonasView project={project} run={run} />

  function openChat(questionId) {
    navigateResult({ view: 'chat', chatQid: questionId ?? qid })
  }

  const chatCount = chatsOf(project, run, person.id).length

  return (
    <>
      <PeopleTrail run={run} pf={effectivePf} steps={[{ label: person.id }]} />
      <div className="page-sub">
        <h2>{person.id}의 프로필과 응답</h2>
        <button className="primary" onClick={() => openChat(null)}>인터뷰{chatCount ? ` (대화 ${chatCount}건)` : ''}</button>
      </div>
      <div className="two">
        <section className="card">
          <h3>기본 정보</h3>
          <ProfileCard person={person} />
          <h3>성격 (Big5 · T점수)</h3>
          <Big5Bars person={person} />
          <details className="all-attrs">
            <summary>전체 프로필 속성 보기</summary>
            <dl className="kv">
              {personaSchema.fields.filter((f) => f.type === 'category' && !BIG5.includes(f.key)).map((f) => (
                <div key={f.key}><dt>{attrLabel(f.key)}</dt><dd>{f.key === 'region' ? attrValue(person, 'region') : person.attributes[f.key]}</dd></div>
              ))}
            </dl>
          </details>
          <p className="muted small-text">가상 시연 프로필 · 실제 사람 자료와 대조하지 않았습니다.</p>
        </section>
        <section className="card">
          <h3>설문 응답 · 전체 {run.survey.questions.length}문항</h3>
          <ResponseItems run={run} person={person} onAsk={openChat} />
        </section>
      </div>
    </>
  )
}
