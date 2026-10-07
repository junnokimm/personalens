import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import { useProject } from '../../store/useProjectStore.js'
import { useUiStore } from '../../store/useUiStore.js'
import { navStatus, StatusMark } from './NavStatus.jsx'
import { useRouteInfo } from './useRouteInfo.js'

function NavChild({ on, label, onClick, meta }) {
  return (
    <button className={`nav-child ${on ? 'on' : ''}`} aria-current={on ? 'page' : undefined} onClick={onClick}>
      <span>{label}</span>
      {meta}
    </button>
  )
}

/* 원본 navHtml()/navStatus() — 왼쪽 사이드바 한 줄 구성(Figma V4 이중 메뉴) */
export default function Sidebar() {
  const navigate = useNavigate()
  const { page, projectId, runId } = useRouteInfo()
  const project = useProject(projectId)
  const resetResultsUi = useUiStore((s) => s.resetResultsUi)

  const section = !project ? '' : ['survey', 'target'].includes(page) ? 'design' : page === 'simulation' ? 'sim' : 'over'

  useEffect(() => {
    if (window.matchMedia('(max-width: 760px)').matches) {
      document.querySelector('.nav-child.on, .nav-root.on')?.scrollIntoView({ inline: 'center', block: 'nearest' })
    }
  }, [page, section])

  if (!project) {
    return (
      <aside className="root-side" aria-label="주 메뉴">
        <button className="brand" onClick={() => navigate('/')}>
          <span className="logo" aria-hidden="true">P</span>PersonaScope
        </button>
      </aside>
    )
  }

  const st = navStatus(project)
  const running = project.runs.find((r) => r.status === 'running')
  const currentRun = project.runs.find((r) => r.id === runId)

  function openResults() {
    const r = currentRun || project.runs.find((x) => x.status === 'completed')
    resetResultsUi()
    navigate(r ? `/p/${project.id}/results/${r.id}` : `/p/${project.id}/results`)
  }

  return (
    <aside className="root-side" aria-label="주 메뉴">
      <button className="brand" onClick={() => navigate('/')}>
        <span className="logo" aria-hidden="true">P</span>PersonaScope
      </button>
      <div>
        <button className="back" onClick={() => navigate('/')}>← 프로젝트 목록</button>
        <p className="ctx-label">현재 프로젝트</p>
        <p className="ctx-name">{project.name}</p>
      </div>
      <nav>
        <div className="nav-group">
          <button className={`nav-root ${section === 'over' ? 'on' : ''}`} onClick={() => navigate(`/p/${project.id}`)}>
            <span className="ico" aria-hidden="true">◎</span>개요
          </button>
          <div className="nav-children">
            <NavChild on={page === 'summary'} label="프로젝트 요약" onClick={() => navigate(`/p/${project.id}`)} />
            <NavChild on={page === 'runs'} label="실행 기록" onClick={() => navigate(`/p/${project.id}/runs`)} meta={<span className="st">{project.runs.length}건</span>} />
            <NavChild on={page === 'results'} label="결과" onClick={openResults} meta={currentRun ? <span className="st">실행 #{currentRun.number}</span> : null} />
          </div>
        </div>
        <div className="nav-group">
          <button className={`nav-root ${section === 'design' ? 'on' : ''}`} onClick={() => navigate(`/p/${project.id}/design/survey`)}>
            <span className="ico" aria-hidden="true">◇</span>설계
          </button>
          <div className="nav-children">
            <NavChild on={page === 'survey'} label="설문" onClick={() => navigate(`/p/${project.id}/design/survey`)} meta={<StatusMark x={st.survey} />} />
            <NavChild on={page === 'target'} label="대상 집단" onClick={() => navigate(`/p/${project.id}/design/target`)} meta={<StatusMark x={st.groups} />} />
          </div>
        </div>
        <div className="nav-group">
          <button className={`nav-root ${section === 'sim' ? 'on' : ''}`} onClick={() => navigate(`/p/${project.id}/simulation`)}>
            <span className="ico" aria-hidden="true">▷</span>시뮬레이션
            {running ? <em className="live" title="실행 중">{running.progress}%</em> : null}
          </button>
        </div>
      </nav>
      <p className="nav-note">집단 분석·페르소나·인터뷰는 결과 안의 단계입니다.</p>
    </aside>
  )
}
