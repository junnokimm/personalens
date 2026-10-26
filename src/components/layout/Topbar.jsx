import { SERVER_STORAGE, useProject, useProjectStore } from '../../store/useProjectStore.js'
import { useUiStore } from '../../store/useUiStore.js'
import { RESULT_SECTIONS, resultSectionOf } from '../../pages/results/resultLinks.js'
import { useRouteInfo } from './useRouteInfo.js'
import { useNavigate, useLocation } from 'react-router-dom'
import { useSessionStore } from '../../store/useSessionStore.js'
import { request } from '../../lib/projectApi.js'

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
  const navigate = useNavigate(), location = useLocation()
  const user = useSessionStore((s) => s.user)
  const { page, projectId, runId, resultView } = useRouteInfo()
  const project = useProject(projectId)
  const saveOk = useUiStore((s) => s.saveOk)
  const sync = useProjectStore((s) => s.sync)
  const dataStatus = useProjectStore((s) => s.dataStatus)
  const pending = Object.values(sync.projects)
  const hasError = dataStatus === 'error' || pending.some((p) => ['error', 'conflict'].includes(p.status))
  const saveLabel = dataStatus === 'loading' ? '불러오는 중…'
    : hasError ? 'DB 저장 확인 필요'
      : pending.length ? 'DB에 저장 중…' : 'DB에 저장됨'

  const run = project?.runs.find((r) => r.id === runId)
  const sectionLabel = RESULT_SECTIONS.find((s) => s.key === resultSectionOf(page, resultView))?.label
  const title = run ? [PAGE_TITLE[page], `실행 #${run.number}`, sectionLabel].filter(Boolean).join(' · ') : PAGE_TITLE[page] || ''
  const crumb = project ? `${project.name} / ${title}` : location.pathname === '/settings/connections' ? '설정 / 모델 연결' : '프로젝트'
  async function logout() {
    try {
      const saved = await useProjectStore.getState().flushSaves()
      if (saved?.some((ok) => !ok)) { useUiStore.getState().showToast('저장 중인 초안을 확인한 뒤 로그아웃하세요.'); return }
      await request('/auth/logout', { method: 'POST' })
      window.location.reload()
    } catch (error) { useUiStore.getState().showToast(error.message) }
  }

  return (
    <header className="topbar">
      <span id="crumb">{crumb}</span>
      <span id="save-state" className={SERVER_STORAGE && hasError ? 'save-error' : ''} role="status">{SERVER_STORAGE ? saveLabel : saveOk ? '자동 저장됨 · 로컬 시연' : '저장 실패 · 브라우저 저장 공간을 확인하세요'}</span>
      {SERVER_STORAGE && user && <div className="account-actions"><button onClick={() => navigate('/settings/connections')}>모델 연결</button><span className="small-text muted">{user.name}</span><button onClick={logout}>로그아웃</button></div>}
    </header>
  )
}
