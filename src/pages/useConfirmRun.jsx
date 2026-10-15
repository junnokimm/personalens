import FilterChips from '../components/filters/FilterChips.jsx'
import { countText, groupError, groupStale } from '../lib/cohort.js'
import { modelName } from '../lib/models.js'
import { validateSurvey } from '../lib/survey.js'
import { startRun } from '../store/useSimulationJob.js'
import { useUiStore } from '../store/useUiStore.js'

/* 시뮬레이션 실행 확인 — 시뮬레이션 화면과 개요(대시보드)가 같은 확인 창·조건으로 실행한다 */
export function useConfirmRun(project) {
  const openConfirm = useUiStore((s) => s.openConfirm)
  const closeConfirm = useUiStore((s) => s.closeConfirm)

  const g = project.groups.find((x) => x.id === project.activeGroupId) || project.groups[0]
  const errs = validateSurvey(project.survey).summary
  const groupErr = groupError(g)
  const stale = groupStale(g)
  const running = project.runs.find((r) => r.status === 'running')
  const ready = !errs.length && !groupErr && !stale
  const nQ = project.survey.questions.length

  function confirmRun() {
    openConfirm({
      title: '시뮬레이션을 실행할까요?',
      ok: '실행',
      body: (
        <>
          <dl className="confirm-dl">
            <div><dt>설문</dt><dd>{project.survey.title} · v{project.survey.draft || !project.survey.version ? project.survey.version + 1 : project.survey.version} · 문항 {nQ}개</dd></div>
            <div><dt>대상 집단</dt><dd>{g.name} · {countText(g)}<FilterChips filters={g.filters} /></dd></div>
            <div><dt>응답 모델</dt><dd>{modelName(project.model?.id)}</dd></div>
            <div><dt>예상 응답</dt><dd>{((g.count || 0) * nQ).toLocaleString()}개</dd></div>
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

  return { group: g, errs, groupErr, stale, running, ready, canRun: ready && !running, nQ, confirmRun }
}
