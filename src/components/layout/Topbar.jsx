import { useProject } from '../../store/useProjectStore.js'
import { useUiStore } from '../../store/useUiStore.js'
import { useRouteInfo } from './useRouteInfo.js'

/* 원본 pageTitle() */
const PAGE_TITLE = {
  summary: '개요 · 프로젝트 요약',
  runs: '개요 · 실행 기록',
  results: '개요 · 결과',
  survey: '설계 · 설문',
  target: '설계 · 대상 집단',
  simulation: '시뮬레이션',
}

export default function Topbar() {
  const { page, projectId } = useRouteInfo()
  const project = useProject(projectId)
  const saveOk = useUiStore((s) => s.saveOk)

  const crumb = project ? `${project.name} / ${PAGE_TITLE[page] || ''}` : '프로젝트'

  return (
    <header className="topbar">
      <span id="crumb">{crumb}</span>
      <span id="save-state" role="status">{saveOk ? '자동 저장됨' : '저장 실패 · 브라우저 저장 공간을 확인하세요'}</span>
    </header>
  )
}
