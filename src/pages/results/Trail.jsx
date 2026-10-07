import { Fragment } from 'react'

import { filterPeople } from '../../lib/analysis.js'
import { attrLabel } from '../../lib/schema.js'
import { answerText, qLabel } from '../../lib/survey.js'

/* 원본 trail() — 탐색 경로. 단계마다 인원을 보여 주고, 각 단계를 누르면 그 단계로 돌아간다 */
export default function Trail({ run, q, drill, onReset, onTrimAttrs, extra = [] }) {
  const steps = [{ label: '전체 응답자', n: run.people.length, onClick: onReset }]
  if (drill.answer !== null) {
    const f = { ['resp:' + q.id]: [String(drill.answer)] }
    steps.push({ label: `${qLabel(run.survey, q)} · ${answerText(q, drill.answer)}`, n: filterPeople(run, f).length, onClick: () => onTrimAttrs(0) })
    drill.attrs.forEach((a, i) => {
      Object.assign(f, { [a.key]: [a.value] })
      steps.push({ label: `${attrLabel(a.key)}: ${a.value}`, n: filterPeople(run, f).length, onClick: () => onTrimAttrs(i + 1) })
    })
  }
  const all = [...steps, ...extra]
  return (
    <nav className="trail" aria-label="탐색 경로">
      {all.map((s, i) => (
        <Fragment key={i}>
          {i ? <span className="sep" aria-hidden="true" /> : null}
          {i === all.length - 1 ? (
            <span className="step cur" aria-current="page">{s.label}{s.n != null ? <b>{s.n}명</b> : null}</span>
          ) : (
            <button className="step" onClick={s.onClick}>{s.label}{s.n != null ? <b>{s.n}명</b> : null}</button>
          )}
        </Fragment>
      ))}
    </nav>
  )
}
