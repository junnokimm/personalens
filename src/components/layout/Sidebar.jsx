import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import { RESULT_SECTIONS, resultSectionOf, resultSectionUrl } from '../../pages/results/resultLinks.js'
import { useProject } from '../../store/useProjectStore.js'
import { useUiStore } from '../../store/useUiStore.js'
import { navStatus, StatusMark } from './NavStatus.jsx'
import { useRouteInfo } from './useRouteInfo.js'

function NavChild({ on, label, onClick, meta, className = '', disabled }) {
  return (
    <button className={`nav-child ${className} ${on ? 'on' : ''}`} aria-current={on ? 'page' : undefined} onClick={onClick} disabled={disabled}>
      <span>{label}</span>
      {meta}
    </button>
  )
}

/* 왼쪽 사이드바 — 프로젝트 단위 메뉴(개요·설계·시뮬레이션·결과) 아래에
 * 결과 단위 메뉴(실행 하나를 고른 뒤의 세 가지 관점)를 한 단계 더 들여 붙인다 */
export default function Sidebar() {
  const navigate = useNavigate()
  const { page, projectId, runId, resultView } = useRouteInfo()
  const project = useProject(projectId)
  const resetResultsUi = useUiStore((s) => s.resetResultsUi)
  const hasKey = useUiStore((s) => !!s.apiKeys[projectId]?.trim())

  const section = !project ? ''
    : ['survey', 'target', 'model'].includes(page) ? 'design'
      : page === 'simulation' ? 'sim'
        : ['runs', 'results', 'interview'].includes(page) ? 'results'
          : 'over'

  useEffect(() => {
    if (window.matchMedia('(max-width: 760px)').matches) {
      document.querySelector('.nav-child.on, .nav-root.on')?.scrollIntoView({ inline: 'center', block: 'nearest' })
    }
  }, [page, section])

  if (!project) {
    return (
      <aside className="root-side" aria-label="주 메뉴">
        <button className="brand" onClick={() => navigate('/')}>
          <span className="logo" aria-hidden="true">P</span>PersonaLens
        </button>
      </aside>
    )
  }

  const st = navStatus(project, hasKey)
  const running = project.runs.find((r) => r.status === 'running')
  /* 결과 하위 메뉴가 가리킬 실행: 지금 보고 있는 실행, 없으면 가장 최근 완료된 실행 */
  const viewing = project.runs.find((r) => r.id === runId && r.status === 'completed')
  const resultRun = viewing || project.runs.find((r) => r.status === 'completed')
  const resultSection = resultSectionOf(page, resultView)

  function openResultSection(key) {
    if (resultRun.id !== runId) resetResultsUi(resultRun)
    navigate(resultSectionUrl(project.id, resultRun, key))
  }

  return (
    <aside className="root-side" aria-label="주 메뉴">
      <button className="brand" onClick={() => navigate('/')}>
        <span className="logo" aria-hidden="true">P</span>PersonaLens
      </button>
      <div>
        <button className="back" onClick={() => navigate('/')}>← 프로젝트 목록</button>
        <p className="ctx-label">현재 프로젝트</p>
        <p className="ctx-name">{project.name}</p>
      </div>
      <nav id="nav">
        <div className="nav-group">
          <button className={`nav-root ${section === 'over' ? 'on' : ''}`} aria-current={section === 'over' ? 'page' : undefined} onClick={() => navigate(`/p/${project.id}`)}>
            <span className="ico" aria-hidden="true">◎</span>개요
          </button>
        </div>
        <div className="nav-group">
          <button className={`nav-root ${section === 'design' ? 'on' : ''}`} onClick={() => navigate(`/p/${project.id}/design/survey`)}>
            <span className="ico" aria-hidden="true">◇</span>설계
          </button>
          <div className="nav-children">
            <NavChild on={page === 'survey'} label="1. 설문" onClick={() => navigate(`/p/${project.id}/design/survey`)} meta={<StatusMark x={st.survey} />} />
            <NavChild on={page === 'target'} label="2. 대상 집단" onClick={() => navigate(`/p/${project.id}/design/target`)} meta={<StatusMark x={st.groups} />} />
            <NavChild on={page === 'model'} label="3. 응답 모델" onClick={() => navigate(`/p/${project.id}/design/model`)} meta={<StatusMark x={st.model} />} />
          </div>
        </div>
        <div className="nav-group">
          <button className={`nav-root ${section === 'sim' ? 'on' : ''}`} aria-current={section === 'sim' ? 'page' : undefined} onClick={() => navigate(`/p/${project.id}/simulation`)}>
            <span className="ico" aria-hidden="true">▷</span>시뮬레이션
            {running ? <em className="live" title="실행 중">{running.progress}%</em> : null}
          </button>
        </div>
        <div className="nav-group">
          <button className={`nav-root ${section === 'results' ? 'on' : ''}`} onClick={() => navigate(`/p/${project.id}/results`)}>
            <span className="ico" aria-hidden="true">▤</span>결과
          </button>
          <div className="nav-children">
            <NavChild on={page === 'runs'} label="실행 기록" onClick={() => navigate(`/p/${project.id}/results`)} meta={<span className="st">{project.runs.length}건</span>} />
            {resultRun ? (
              <>
                <p className="nav-sub-label">실행 #{resultRun.number} 결과</p>
                {RESULT_SECTIONS.map((s) => (
                  <NavChild key={s.key} className="sub" on={!!viewing && resultSection === s.key} label={s.label} onClick={() => openResultSection(s.key)} />
                ))}
              </>
            ) : null}
          </div>
        </div>
      </nav>
      <p className="nav-note">{resultRun ? '결과 하위 메뉴는 위 실행 하나를 여러 관점으로 봅니다. 다른 실행은 실행 기록에서 고르세요.' : '실행을 마치면 결과 하위 메뉴가 나타납니다.'}</p>
    </aside>
  )
}
