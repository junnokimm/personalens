import { Fragment } from 'react'
import { useSearchParams } from 'react-router-dom'

import { filterPeople } from '../../lib/analysis.js'

/* 원본 peopleTrail() — DetailView·ChatView가 함께 쓰는 탐색 경로. 첫 단계는 항상 "페르소나 목록" */
export default function PeopleTrail({ run, pf, steps = [] }) {
  const [, setSearchParams] = useSearchParams()
  const all = [{ label: '페르소나 목록', n: filterPeople(run, pf).length, onClick: () => setSearchParams({ view: 'personas' }) }, ...steps]
  return (
    <nav className="trail" aria-label="탐색 경로">
      {all.map((s, i) => (
        <Fragment key={i}>
          {i ? <span className="sep" aria-hidden="true" /> : null}
          {i === all.length - 1 ? (
            <span className="step cur">{s.label}</span>
          ) : (
            <button className="step" onClick={s.onClick}>{s.label}{s.n != null ? <b>{s.n}명</b> : null}</button>
          )}
        </Fragment>
      ))}
    </nav>
  )
}
