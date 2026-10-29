import FilterChips from '../components/filters/FilterChips.jsx'
import { countText, groupError, groupStale } from '../lib/cohort.js'
import { modelName } from '../lib/models.js'
import { validateSurvey } from '../lib/survey.js'
import { startRun } from '../store/useSimulationJob.js'
import { useUiStore } from '../store/useUiStore.js'
import { SERVER_STORAGE, useProjectStore } from '../store/useProjectStore.js'
import { isRunActive } from '../lib/runStatus.js'
import { useConnectionStore } from '../store/useConnectionStore.js'
import { executionFor } from '../lib/execution.js'

/* 시뮬레이션 실행 확인 — 시뮬레이션 화면과 개요(대시보드)가 같은 확인 창·조건으로 실행한다 */
export function useConfirmRun(project) {
  const openConfirm = useUiStore((s) => s.openConfirm)
  const closeConfirm = useUiStore((s) => s.closeConfirm)
  const starting = useProjectStore((s) => !!s.startingRuns?.[project.id])
  const runsError = useProjectStore((s) => s.runsError)
  const connections = useConnectionStore()
  const execution = executionFor(project.model, connections)

  const g = project.groups.find((x) => x.id === project.activeGroupId) || project.groups[0]
  const errs = validateSurvey(project.survey).summary
  const groupErr = groupError(g)
  const stale = groupStale(g)
  const running = project.runs.find(isRunActive)
  const nQ = project.survey.questions.length
  const limitError = SERVER_STORAGE && execution.engine === 'openai' &&
    (g.count > connections.inferenceLimits.maxPeople || g.count * nQ > connections.inferenceLimits.maxResponses)
    ? `OpenAI 실행은 최대 ${connections.inferenceLimits.maxPeople}명·${connections.inferenceLimits.maxResponses}개 응답입니다.` : ''
  const executionError = SERVER_STORAGE ? execution.error || limitError : ''
  const ready = !errs.length && !groupErr && !stale && !starting && !runsError && !executionError

  function confirmRun() {
    openConfirm({
      title: '시뮬레이션을 실행할까요?',
      ok: '실행',
      body: (
        <>
          <dl className="confirm-dl">
            <div><dt>설문</dt><dd>{project.survey.title} · v{project.survey.draft || !project.survey.version ? project.survey.version + 1 : project.survey.version} · 문항 {nQ}개</dd></div>
            <div><dt>대상 집단</dt><dd>{g.name} · {countText(g)}<FilterChips filters={g.filters} /></dd></div>
            <div><dt>응답 생성</dt><dd>{SERVER_STORAGE ? execution.label : modelName(project.model?.id)}</dd></div>
            <div><dt>예상 응답</dt><dd>{((g.count || 0) * nQ).toLocaleString()}개</dd></div>
          </dl>
          <p className="muted small-text">{SERVER_STORAGE ? '저장된 설계가 고정됩니다. 브라우저를 닫아도 서버 워커가 계속 처리합니다.' : '실행 중에도 다른 화면으로 이동할 수 있습니다. 끝나면 알림이 뜹니다.'}</p>
          {SERVER_STORAGE && execution.engine === 'openai' && <p className="connection-notice">추출한 페르소나의 속성과 설문을 {connections.mockMode ? '로컬 모의 서버' : 'OpenAI'}에 전송합니다. {connections.mockMode ? '외부 API 과금은 없습니다.' : '선택한 연결의 API 사용료가 발생합니다.'} 기본 호출은 {g.count * nQ}회이며, 오류 재시도 시 추가 호출될 수 있습니다.</p>}
        </>
      ),
      onOk: () => {
        closeConfirm()
        startRun(project.id, SERVER_STORAGE ? { engine: execution.engine, ...(execution.selection ? { selection: execution.selection } : {}) } : undefined)
      },
    })
  }

  return { group: g, errs, groupErr, stale, running, ready, canRun: ready && !running, nQ, confirmRun, execution, executionError }
}
