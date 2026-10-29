import { useNavigate, useParams } from 'react-router-dom'

import Banner from '../components/common/Banner.jsx'
import PageHead from '../components/common/PageHead.jsx'
import FilterChips from '../components/filters/FilterChips.jsx'
import { countText, groupFlowState, groupStale } from '../lib/cohort.js'
import { SERVER_STORAGE, useProject, useProjectStore } from '../store/useProjectStore.js'
import { stableJson } from '../lib/projectApi.js'
import { useUiStore } from '../store/useUiStore.js'
import { modelName } from '../lib/models.js'
import { josa } from '../utils/format.js'
import { useConfirmRun } from './useConfirmRun.jsx'
import RunProgress from '../components/common/RunProgress.jsx'

/* 원본 sameAsRun() */
function sameAsRun(project, g) {
  if (project.survey.draft || groupStale(g)) return null
  return project.runs.find((r) => r.engine?.kind !== 'openai' && r.status === 'completed' && r.groupId === g.id && r.survey.version === project.survey.version
    && new Date(g.cohort.created) <= new Date(r.created)
    && stableJson(r.groupConfig) === stableJson({ count: g.count, filters: g.filters })) || null
}

/* 원본 simulation() — 실행만 담당한다. 실행 기록은 결과 › 실행 기록에서 본다 */
export default function SimulationPage() {
  const { projectId } = useParams()
  const project = useProject(projectId)
  const navigate = useNavigate()
  const selectGroup = useProjectStore((s) => s.selectGroup)
  const resetResultsUi = useUiStore((s) => s.resetResultsUi)
  const failNext = useUiStore((s) => s.failNext)
  const setFailNext = useUiStore((s) => s.setFailNext)
  const { group: g, errs, groupErr, stale, running, ready, nQ, confirmRun: handleConfirmRun, execution, executionError } = useConfirmRun(project)

  const same = ready && execution.engine === 'demo' ? sameAsRun(project, g) : null
  const last = project.runs.find((r) => r.status === 'completed')

  const diffs = last ? [
    project.survey.draft ? `설문: v${last.survey.version} → v${project.survey.version + 1} (변경됨)` : last.survey.version !== project.survey.version ? `설문: v${last.survey.version} → v${project.survey.version}` : '설문: 같음',
    last.groupId !== g.id ? `대상 집단: ${last.groupName} → ${g.name}` : JSON.stringify(last.groupConfig) !== JSON.stringify({ count: g.count, filters: g.filters }) ? '대상 집단: 조건 또는 인원 변경' : '대상 집단: 같음',
  ] : []

  function openResult(run) {
    resetResultsUi(run)
    navigate(`/p/${project.id}/results/${run.id}`)
  }

  return (
    <>
      <PageHead title="시뮬레이션" sub="설계한 설문과 대상 집단으로 합성 응답을 만듭니다. 설정은 설계 메뉴에서 바꿉니다." />
      <div className="two even">
        <section className="card">
          <div className="card-top"><h2>설문</h2><button className="small" onClick={() => navigate(`/p/${project.id}/design/survey`)}>설계에서 수정</button></div>
          <p className="big">{project.survey.title || '주제 미입력'}</p>
          <p className="muted">{project.survey.draft || !project.survey.version ? `v${project.survey.version + 1}로 확정되어 실행됩니다` : `v${project.survey.version}`} · 문항 {nQ}개</p>
          {errs.length ? <p className="err-text">확인할 내용 {errs.length}개 · {errs[0].msg}</p> : <p className="ok-text">실행 준비 완료</p>}
        </section>
        <section className="card">
          <div className="card-top"><h2>대상 집단</h2><button className="small" onClick={() => navigate(`/p/${project.id}/design/target`)}>설계에서 수정</button></div>
          <div className="field">
            <label htmlFor="sim-group">실행할 대상 집단</label>
            <select id="sim-group" value={g.id} onChange={(ev) => selectGroup(project.id, ev.target.value)}>
              {project.groups.map((x) => {
                const xFlow = groupFlowState(x)
                return <option key={x.id} value={x.id}>{x.name} · {countText(x)}{xFlow.ready ? '' : ` (${xFlow.label})`}</option>
              })}
            </select>
          </div>
          <FilterChips filters={g.filters} />
          {groupErr ? <p className="err-text">{groupErr} <button className="link" onClick={() => navigate(`/p/${project.id}/design/target`)}>대상 집단에서 수정</button></p>
            : stale ? <p className="err-text">이 집단은 현재 조건으로 구성되지 않았습니다. <button className="link" onClick={() => navigate(`/p/${project.id}/design/target`)}>대상 집단에서 구성</button></p>
              : <p className="ok-text">실행 준비 완료</p>}
        </section>
      </div>
      <section className="card run-card">
        {SERVER_STORAGE && execution.engine === 'demo' ? <label className="check"><input type="checkbox" checked={failNext} disabled={!!running} onChange={(ev) => setFailNext(ev.target.checked)} />실패·재시도 시연: 한 페르소나의 응답 생성을 한 번 실패시킵니다.</label> : null}
        <div className="card-top">
          <div>
            <h2>실행</h2>
            <p className="muted">{countText(g)} × 문항 {nQ}개 = 예상 응답 <b>{((g.count || 0) * nQ).toLocaleString()}개</b></p>
            <p className="muted small-text">{SERVER_STORAGE ? execution.label : `응답 모델 ${modelName(project.model?.id)}`} · <button className="link" onClick={() => navigate(`/p/${project.id}/design/model`)}>설계에서 변경</button></p>
            {executionError && <p className="err-text">{executionError}</p>}
          </div>
          <span className={`tag ${running ? 'info' : ready ? 'ok' : 'bad'}`}>{running ? '실행 중' : ready ? '실행 준비 완료' : '설계 확인 필요'}</span>
        </div>
        {diffs.length ? <p className="small-text muted">실행 #{last.number}{josa(last.number, ['과', '와'])} 비교 · {diffs.join(' · ')}</p> : null}
        {running ? (
          <p className="muted small-text">프로젝트마다 한 번에 하나씩 실행할 수 있습니다.</p>
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
            실행 #{same.number}{josa(same.number, ['과', '와'])} 설정이 같습니다. 시연 생성기는 같은 결과를 냅니다.
          </Banner>
        ) : (
          <button className="primary" disabled={!ready} onClick={handleConfirmRun}>시뮬레이션 실행</button>
        )}
        {(running || project.runs[0]) && <RunProgress projectId={project.id} run={running || project.runs[0]} openResult={openResult} />}
      </section>
      <p className="muted small-text">
        지난 실행은 <button className="link" onClick={() => navigate(`/p/${project.id}/results`)}>결과 › 실행 기록</button>에서 봅니다.
      </p>
    </>
  )
}
