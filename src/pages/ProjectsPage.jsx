import { useNavigate } from 'react-router-dom'

import PageHead from '../components/common/PageHead.jsx'
import { versionText } from '../lib/survey.js'
import { SERVER_STORAGE, useProjectStore } from '../store/useProjectStore.js'
import { useUiStore } from '../store/useUiStore.js'

/* 원본 projects()/newProject()/resetDemo() */
export default function ProjectsPage() {
  const navigate = useNavigate()
  const projects = useProjectStore((s) => s.projects)
  const newProject = useProjectStore((s) => s.newProject)
  const resetDemo = useProjectStore((s) => s.resetDemo)
  const openConfirm = useUiStore((s) => s.openConfirm)
  const closeConfirm = useUiStore((s) => s.closeConfirm)
  const importLegacy = useProjectStore((s) => s.importLegacy)
  let hasLegacy = false
  try { hasLegacy = JSON.parse(localStorage.getItem('personascope-proto-v4'))?.projects?.length > 0 } catch { /* no legacy data */ }

  function openNewProject() {
    function handleCreate() {
      const nameInput = document.getElementById('np-name')
      const name = nameInput.value.trim()
      if (!name) { nameInput.focus(); return }
      const description = document.getElementById('np-desc').value.trim()
      const id = newProject(name, description)
      closeConfirm()
      navigate(`/p/${id}/design/survey`)
    }
    function handleKeyDown(ev) {
      if (ev.key === 'Enter') handleCreate()
    }
    openConfirm({
      title: '새 프로젝트',
      ok: '만들기',
      initialFocus: 'np-name',
      body: (
        <>
          <div className="field"><label htmlFor="np-name">프로젝트 이름</label><input id="np-name" maxLength={500} placeholder="예: 청년 주거 정책 인식 조사" onKeyDown={handleKeyDown} /></div>
          <div className="field"><label htmlFor="np-desc">설명 (선택)</label><input id="np-desc" onKeyDown={handleKeyDown} /></div>
        </>
      ),
      onOk: handleCreate,
    })
  }

  function openResetDemo() {
    openConfirm({
      title: SERVER_STORAGE ? '예시 프로젝트 추가' : '예시 데이터 다시 만들기',
      ok: SERVER_STORAGE ? '추가' : '다시 만들기',
      danger: !SERVER_STORAGE,
      body: <p>{SERVER_STORAGE ? '기존 프로젝트를 유지하고 시연용 예시 프로젝트를 추가합니다. 예시의 실행 결과는 이 브라우저에만 저장됩니다.' : '모든 프로젝트와 실행 기록을 지우고 예시 프로젝트만 남깁니다.'}</p>,
      onOk: () => {
        resetDemo()
        closeConfirm()
        navigate('/')
      },
    })
  }

  return (
    <>
      <PageHead title="프로젝트" sub="프로젝트마다 설문 한 세트와 대상 집단, 실행 기록을 가집니다.">
        <button className="primary" onClick={openNewProject}>새 프로젝트</button>
      </PageHead>
      {SERVER_STORAGE && hasLegacy ? <div className="banner info"><span>이 브라우저에 이전 프로젝트가 있습니다. 사본으로 가져오면 DB에 저장됩니다.</span><button className="small" onClick={() => openConfirm({ title: '브라우저 프로젝트 가져오기', ok: '가져오기', body: <p>브라우저의 프로젝트를 새 사본으로 가져옵니다. 기존 데이터는 그대로 남습니다.</p>, onOk: () => { importLegacy(); closeConfirm() } })}>브라우저 프로젝트 가져오기</button></div> : null}
      {!projects.length ? <p className="empty">아직 프로젝트가 없습니다. 새 프로젝트를 만들거나 예시 프로젝트를 추가하세요.</p> : null}
      <div className="project-grid">
        {projects.map((p) => (
          <button key={p.id} className="project-card" onClick={() => navigate(`/p/${p.id}`)}>
            <b>{p.name}</b>
            <span className="muted">{p.description || '설명 없음'}</span>
            <span className="meta">설문 {versionText(p.survey)} · 대상 집단 {p.groups.length}개 · 실행 {p.runs.length}건</span>
          </button>
        ))}
      </div>
      <p className="muted small-text">{SERVER_STORAGE ? '기존 기능을 살펴보려면 ' : '예시 데이터를 처음 상태로 돌리려면 '}<button className="link" onClick={openResetDemo}>{SERVER_STORAGE ? '예시 프로젝트 추가' : '예시 데이터 다시 만들기'}</button></p>
    </>
  )
}
