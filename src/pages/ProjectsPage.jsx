import { useNavigate } from 'react-router-dom'

import PageHead from '../components/common/PageHead.jsx'
import { versionText } from '../lib/survey.js'
import { useProjectStore } from '../store/useProjectStore.js'
import { useUiStore } from '../store/useUiStore.js'

/* 원본 projects()/newProject()/resetDemo() */
export default function ProjectsPage() {
  const navigate = useNavigate()
  const projects = useProjectStore((s) => s.projects)
  const newProject = useProjectStore((s) => s.newProject)
  const resetDemo = useProjectStore((s) => s.resetDemo)
  const openConfirm = useUiStore((s) => s.openConfirm)
  const closeConfirm = useUiStore((s) => s.closeConfirm)

  function openNewProject() {
    openConfirm({
      title: '새 프로젝트',
      ok: '만들기',
      initialFocus: 'np-name',
      body: (
        <>
          <div className="field"><label htmlFor="np-name">프로젝트 이름</label><input id="np-name" placeholder="예: 청년 주거 정책 인식 조사" /></div>
          <div className="field"><label htmlFor="np-desc">설명 (선택)</label><input id="np-desc" /></div>
        </>
      ),
      onOk: () => {
        const nameInput = document.getElementById('np-name')
        const name = nameInput.value.trim()
        if (!name) { nameInput.focus(); return }
        const description = document.getElementById('np-desc').value.trim()
        const id = newProject(name, description)
        closeConfirm()
        navigate(`/p/${id}/design/survey`)
      },
    })
  }

  function openResetDemo() {
    openConfirm({
      title: '예시 데이터 다시 만들기',
      ok: '다시 만들기',
      danger: true,
      body: <p>모든 프로젝트와 실행 기록을 지우고 예시 프로젝트만 남깁니다.</p>,
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
      <div className="project-grid">
        {projects.map((p) => (
          <button key={p.id} className="project-card" onClick={() => navigate(`/p/${p.id}`)}>
            <b>{p.name}</b>
            <span className="muted">{p.description || '설명 없음'}</span>
            <span className="meta">설문 {versionText(p.survey)} · 대상 집단 {p.groups.length}개 · 실행 {p.runs.length}건</span>
          </button>
        ))}
      </div>
      <p className="muted small-text">예시 데이터를 처음 상태로 돌리려면 <button className="link" onClick={openResetDemo}>예시 데이터 다시 만들기</button></p>
    </>
  )
}
