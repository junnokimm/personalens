import { useProject } from '../../store/useProjectStore.js'
import { useUiStore } from '../../store/useUiStore.js'
import { RESULT_SECTIONS, resultSectionOf } from '../../pages/results/resultLinks.js'
import { useRouteInfo } from './useRouteInfo.js'

/* 원본 pageTitle() — 사이드바 메뉴 구조와 같은 순서·이름 */
const PAGE_TITLE = {
  summary: '개요',
  survey: '설계 · 설문',
  target: '설계 · 대상 집단',
  model: '설계 · 응답 모델',
  simulation: '시뮬레이션',
  runs: '결과 · 실행 기록',
  results: '결과',
  interview: '결과',
}

export default function Topbar() {
  const { page, projectId, runId, resultView } = useRouteInfo()
  const project = useProject(projectId)
  const saveOk = useUiStore((s) => s.saveOk)

  const run = project?.runs.find((r) => r.id === runId)
  const sectionLabel = RESULT_SECTIONS.find((s) => s.key === resultSectionOf(page, resultView))?.label
  const title = run ? [PAGE_TITLE[page], `실행 #${run.number}`, sectionLabel].filter(Boolean).join(' · ') : PAGE_TITLE[page] || ''
  const crumb = project ? `${project.name} / ${title}` : '프로젝트'

  return (
    <header className="topbar">
      <span id="crumb">{crumb}</span>
      <span id="save-state" role="status">{saveOk ? '자동 저장됨' : '저장 실패 · 브라우저 저장 공간을 확인하세요'}</span>
    </header>
  )
}
