import { useNavigate, useParams } from 'react-router-dom'

import Banner from '../components/common/Banner.jsx'
import PageHead from '../components/common/PageHead.jsx'
import FilterChips from '../components/filters/FilterChips.jsx'
import { groupStale } from '../lib/cohort.js'
import { validateSurvey } from '../lib/survey.js'
import RunRow from './overview/RunRow.jsx'
import { useProject, useProjectStore } from '../store/useProjectStore.js'
import { startRun } from '../store/useSimulationJob.js'
import { useUiStore } from '../store/useUiStore.js'

/* 원본 sameAsRun() */
function sameAsRun(project, g) {
  if (project.survey.draft || groupStale(g)) return null
  return project.runs.find((r) => r.status === 'completed' && r.groupId === g.id && r.survey.version === project.survey.version
    && new Date(g.cohort.created) <= new Date(r.created)
    && JSON.stringify(r.groupConfig) === JSON.stringify({ count: g.count, filters: g.filters })) || null
}

/* 원본 simulation()/confirmRun() */
export default function SimulationPage() {
  const { projectId } = useParams()
  const project = useProject(projectId)
  const navigate = useNavigate()
  const selectGroup = useProjectStore((s) => s.selectGroup)
  const failNext = useUiStore((s) => s.failNext)
  const setFailNext = useUiStore((s) => s.setFailNext)
  const openConfirm = useUiStore((s) => s.openConfirm)
  const closeConfirm = useUiStore((s) => s.closeConfirm)
  const resetResultsUi = useUiStore((s) => s.resetResultsUi)

  const g = project.groups.find((x) => x.id === project.activeGroupId) || project.groups[0]
  const errs = validateSurvey(project.survey).summary
  const stale = groupStale(g)
  const ready = !errs.length && !stale
  const nQ = project.survey.questions.length
  const same = ready ? sameAsRun(project, g) : null
  const last = project.runs.find((r) => r.status === 'completed')
  const running = project.runs.find((r) => r.status === 'running')

  const diffs = last ? [
    project.survey.draft ? `설문: v${last.survey.version} → v${project.survey.version + 1} (변경됨)` : last.survey.version !== project.survey.version ? `설문: v${last.survey.version} → v${project.survey.version}` : '설문: 같음',
    last.groupId !== g.id ? `대상 집단: ${last.groupName} → ${g.name}` : JSON.stringify(last.groupConfig) !== JSON.stringify({ count: g.count, filters: g.filters }) ? '대상 집단: 조건 또는 인원 변경' : '대상 집단: 같음',
  ] : []

  function openResult(run) {
    resetResultsUi(run)
    navigate(`/p/${project.id}/results/${run.id}`)
  }

  function handleConfirmRun() {
    openConfirm({
      title: '시뮬레이션을 실행할까요?',
      ok: '실행',
      body: (
        <>
          <dl className="confirm-dl">
            <div><dt>설문</dt><dd>{project.survey.title} · v{project.survey.draft || !project.survey.version ? project.survey.version + 1 : project.survey.version} · 문항 {nQ}개</dd></div>
            <div><dt>대상 집단</dt><dd>{g.name} · {g.count}명<FilterChips filters={g.filters} /></dd></div>
            <div><dt>예상 응답</dt><dd>{(g.count * nQ).toLocaleString()}개</dd></div>
          </dl>
          <p className="muted small-text">실행 중에도 다른 화면으로 이동할 수 있습니다. 끝나면 알림이 뜹니다.</p>
        </>
      ),
      onOk: () => {
        closeConfirm()
        startRun(project.id)
      },
    })
  }

  return (
    <>
      <PageHead title="시뮬레이션" sub="설계한 설문과 대상 집단으로 합성 응답을 만듭니다. 설정은 설계 메뉴에서 바꿉니다." />
      <div className="two even">
        <section className="card">
          <div className="card-top"><h2>설문</h2><button className="small" onClick={() => navigate(`/p/${project.id}/design/survey`)}>설계에서 수정</button></div>
          <p className="big">{project.survey.title || '주제 미입력'}</p>
          <p className="muted">{project.survey.draft || !project.survey.version ? `v${project.survey.version + 1}로 확정되어 실행됩니다` : `v${project.survey.version}`} · 문항 {nQ}개</p>
          {errs.length ? <p className="err-text">확인할 내용 {errs.length}개 · {errs[0].msg}</p> : <p className="ok-text">준비됨</p>}
        </section>
        <section className="card">
          <div className="card-top"><h2>대상 집단</h2><button className="small" onClick={() => navigate(`/p/${project.id}/design/target`)}>설계에서 수정</button></div>
          <div className="field">
            <label htmlFor="sim-group">실행할 대상 집단</label>
            <select id="sim-group" value={g.id} onChange={(ev) => selectGroup(project.id, ev.target.value)}>
              {project.groups.map((x) => (
                <option key={x.id} value={x.id}>{x.name} · {x.count}명{groupStale(x) ? ' (구성 필요)' : ''}</option>
              ))}
            </select>
          </div>
          <FilterChips filters={g.filters} />
          {stale ? <p className="err-text">이 집단은 현재 조건으로 구성되지 않았습니다. <button className="link" onClick={() => navigate(`/p/${project.id}/design/target`)}>대상 집단에서 구성</button></p> : <p className="ok-text">준비됨</p>}
        </section>
      </div>
      <section className="card run-card">
        <div className="card-top">
          <div>
            <h2>실행</h2>
            <p className="muted">{g.count}명 × 문항 {nQ}개 = 예상 응답 <b>{(g.count * nQ).toLocaleString()}개</b></p>
          </div>
          <span className={`tag ${ready ? 'ok' : 'bad'}`}>{ready ? '실행 가능' : '설계 확인 필요'}</span>
        </div>
        {diffs.length ? <p className="small-text muted">실행 #{last.number}과 비교 · {diffs.join(' · ')}</p> : null}
        {running ? (
          <Banner tone="info">실행 #{running.number}이 진행 중입니다 ({running.progress}%). 다른 화면으로 이동해도 계속되고, 끝나면 알림이 뜹니다. 한 번에 하나씩 실행할 수 있습니다.</Banner>
        ) : same ? (
          <Banner
            tone="info"
            actions={(
              <>
                <button className="small primary" onClick={() => openResult(same)}>실행 #{same.number} 결과 보기</button>
                <button className="small" onClick={handleConfirmRun}>그래도 새로 실행</button>
              </>
            )}
          >
            실행 #{same.number}과 설정이 같습니다. 시연 생성기는 같은 결과를 냅니다.
          </Banner>
        ) : (
          <button className="primary" disabled={!ready} onClick={handleConfirmRun}>시뮬레이션 실행</button>
        )}
        <details className="demo">
          <summary>시연 옵션</summary>
          <label className="check">
            <input type="checkbox" checked={failNext} onChange={(ev) => setFailNext(ev.target.checked)} /> 다음 실행을 60%에서 실패시키기 (실패·다시 시도 확인용)
          </label>
        </details>
      </section>
      <section className="card">
        <div className="card-top"><h2>최근 실행</h2><button className="small" onClick={() => navigate(`/p/${project.id}/runs`)}>실행 기록 전체</button></div>
        {project.runs.length ? project.runs.slice(0, 3).map((r) => <RunRow key={r.id} projectId={project.id} run={r} />) : <p className="muted">실행 기록이 없습니다.</p>}
      </section>
    </>
  )
}
