import { useEffect } from 'react'
import personaSchema from '../../data/personaSchema.json'
import { useProjectStore } from '../../store/useProjectStore.js'
import { attrLabel, attrValue, BIG5, districtName, tScore } from '../../lib/schema.js'
import { displayRegion } from '../../utils/format.js'
import { useUiStore } from '../../store/useUiStore.js'
import PersonasView, { chatCountOf } from './PersonasView.jsx'
import { useInterviewStore } from '../../store/useInterviewStore.js'
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
        <div key={k}>
          <dt>{k === 'region' ? '지역' : attrLabel(k)}</dt>
          <dd>{k === 'region' ? displayRegion(person.attributes.region) + ' ' + districtName(person.attributes.district) : attrValue(person, k)}</dd>
        </div>
      ))}
      <div><dt>직업</dt><dd>{person.attributes.occupation}</dd></div>
    </dl>
  )
}

/* 원본 detailView() */
export default function DetailView({ project, run }) {
  useInterviewStore((s) => s.threads)
  const { qid, drill, personaId, navigateResult } = useResultUrl()
  const pf = useUiStore((s) => s.pf)
  const urlFilters = drillFilters(qid, drill)
  const effectivePf = Object.keys(urlFilters).length ? urlFilters : pf

  const person = run.people.find((p) => p.id === personaId)
  const loadPerson = useProjectStore((s) => s.loadRunPerson)
  const error = useProjectStore((s) => s.personErrors?.[`person:${run.id}:${personaId}`])
  useEffect(() => { if (run._server && person?.compact) void loadPerson(project.id, run.id, person.id) }, [project.id, run.id, person?.id, person?.compact, loadPerson])
  if (!person) return <PersonasView project={project} run={run} />
  if (person.compact) return <section className="card">{error || '전체 프로필을 불러오는 중…'}{error && <button onClick={() => loadPerson(project.id, run.id, person.id)}>다시 불러오기</button>}</section>

  function openChat(questionId) {
    navigateResult({ view: 'chat', chatQid: questionId ?? qid })
  }

  const chatCount = chatCountOf(project, run, person.id)

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
                <div key={f.key}><dt>{attrLabel(f.key)}</dt><dd>{f.key === 'region' ? displayRegion(person.attributes.region) : person.attributes[f.key]}</dd></div>
              ))}
            </dl>
          </details>
          <p className="muted small-text">{person.sourceRecordId ? 'Parquet 원본에서 추출해 실행 시점에 저장한 합성 페르소나입니다.' : '가상 시연 프로필입니다.'}</p>
        </section>
        <section className="card">
          <h3>설문 응답 · 전체 {run.survey.questions.length}문항</h3>
          <ResponseItems run={run} person={person} onAsk={openChat} />
        </section>
      </div>
    </>
  )
}
