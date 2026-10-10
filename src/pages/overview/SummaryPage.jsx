import { useNavigate, useParams } from 'react-router-dom'

import Banner from '../../components/common/Banner.jsx'
import PageHead from '../../components/common/PageHead.jsx'
import StatusTag from '../../components/common/StatusTag.jsx'
import FilterChips from '../../components/filters/FilterChips.jsx'
import { groupStale } from '../../lib/cohort.js'
import { validateSurvey, versionText } from '../../lib/survey.js'
import { useProject } from '../../store/useProjectStore.js'
import { useUiStore } from '../../store/useUiStore.js'
import { stamp } from '../../utils/format.js'
import RunRow from './RunRow.jsx'

/* 원본 summary() */
export default function SummaryPage() {
  const navigate = useNavigate()
  const { projectId } = useParams()
  const project = useProject(projectId)
  const resetResultsUi = useUiStore((s) => s.resetResultsUi)

  const last = project.runs[0]
  const g = project.groups.find((x) => x.id === project.activeGroupId) || project.groups[0]
  const errs = validateSurvey(project.survey).summary
  const qs = project.survey.questions
  const follow = qs.filter((q) => q.parentId).length
  const chats = Object.entries(project.chats)
    .filter(([, v]) => v.length)
    .map(([k, v]) => { const [rid, pid] = k.split('::'); return { rid, pid, n: v.length, at: v[v.length - 1].created } })
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 4)

  function openResult(runId) {
    resetResultsUi(project.runs.find((r) => r.id === runId))
    navigate(`/p/${project.id}/results/${runId}`)
  }
  function openChat(runId, personaId) {
    const run = project.runs.find((item) => item.id === runId)
    resetResultsUi(run)
    const qid = run.survey.questions.find((item) => item.type !== 'text')?.id || run.survey.questions[0].id
    const params = new URLSearchParams({ view: 'chat', run: run.id, q: qid, seg: 'sex', persona: personaId, chatQ: qid })
    navigate(`/p/${project.id}/results/${runId}?${params}`)
  }

  return (
    <>
      <PageHead title={project.name} sub={project.description || ''}>
        <button className="primary" onClick={() => navigate(`/p/${project.id}/simulation`)}>새 시뮬레이션</button>
      </PageHead>
      {project.survey.draft && project.runs.length ? (
        <Banner
          tone="warn"
          actions={<button className="small" onClick={() => navigate(`/p/${project.id}/simulation`)}>시뮬레이션으로</button>}
        >
          마지막 실행 이후 설문이 바뀌었습니다. 지금 결과는 이전 버전(v{project.survey.version}) 기준입니다. 다음 실행 때 v{project.survey.version + 1}로 확정됩니다.
        </Banner>
      ) : null}
      <div className="sum-grid">
        <section className="card sum">
          <h2>설문</h2>
          <p className="big">{project.survey.title || '주제 미입력'}</p>
          <p className="muted">{versionText(project.survey)} · 문항 {qs.length}개{follow ? ` (후속 질문 ${follow}개 포함)` : ''}</p>
          {errs.length ? <p className="err-text">확인할 내용 {errs.length}개</p> : null}
          <button className="small" onClick={() => navigate(`/p/${project.id}/design/survey`)}>설문 열기</button>
        </section>
        <section className="card sum">
          <h2>대상 집단</h2>
          <p className="big">{g.name} · {g.count}명</p>
          <FilterChips filters={g.filters} />
          <p className="muted small-text">저장된 대상 집단 {project.groups.length}개{groupStale(g) ? ' · 이 집단은 다시 구성이 필요합니다' : ''}</p>
          <button className="small" onClick={() => navigate(`/p/${project.id}/design/target`)}>대상 집단 열기</button>
        </section>
        <section className="card sum">
          <h2>최근 실행</h2>
          {last ? (
            <>
              <p className="big">실행 #{last.number} <StatusTag run={last} /></p>
              <p className="muted">{stamp(last.created)} · {last.groupName} {last.people.length}명</p>
              {last.status === 'completed' ? <button className="small" onClick={() => openResult(last.id)}>결과 보기</button> : null}
            </>
          ) : (
            <p className="muted">아직 실행하지 않았습니다. 설계를 마친 뒤 시뮬레이션을 실행하세요.</p>
          )}
        </section>
      </div>
      <div className="two">
        <section className="card">
          <div className="card-top">
            <h2>최근 실행</h2>
            <button className="small" onClick={() => navigate(`/p/${project.id}/runs`)}>실행 기록 전체</button>
          </div>
          {project.runs.length
            ? project.runs.slice(0, 3).map((r) => <RunRow key={r.id} projectId={project.id} run={r} />)
            : <p className="muted">실행 기록이 없습니다.</p>}
        </section>
        <section className="card">
          <div className="card-top"><h2>최근 인터뷰</h2></div>
          {chats.length
            ? chats.map((c) => {
                const r = project.runs.find((x) => x.id === c.rid)
                if (!r) return null
                return (
                  <div className="run-row" key={c.rid + '::' + c.pid}>
                    <div>
                      <b>{c.pid}</b> <span className="tag">대화 {c.n}건</span>
                      <p className="muted small-text">실행 #{r.number} · {stamp(c.at)}</p>
                    </div>
                    <button className="small" onClick={() => openChat(r.id, c.pid)}>이어서 대화</button>
                  </div>
                )
              })
            : <p className="muted">결과 화면의 페르소나에서 인터뷰를 시작할 수 있습니다.</p>}
        </section>
      </div>
    </>
  )
}
