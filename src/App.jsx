import { useEffect } from 'react'
import { Navigate, Outlet, Route, Routes, useParams } from 'react-router-dom'

import ConfirmModal from './components/common/ConfirmModal.jsx'
import Toast from './components/common/Toast.jsx'
import PersistenceNotice from './components/common/PersistenceNotice.jsx'
import FilterModal from './components/filters/FilterModal.jsx'
import Sidebar from './components/layout/Sidebar.jsx'
import Topbar from './components/layout/Topbar.jsx'
import ProjectsPage from './pages/ProjectsPage.jsx'
import SummaryPage from './pages/overview/SummaryPage.jsx'
import RunsPage from './pages/overview/RunsPage.jsx'
import ModelPage from './pages/design/ModelPage.jsx'
import SurveyPage from './pages/design/SurveyPage.jsx'
import TargetPage from './pages/design/TargetPage.jsx'
import SimulationPage from './pages/SimulationPage.jsx'
import InterviewPage from './pages/results/InterviewPage.jsx'
import ResultsPage from './pages/results/ResultsPage.jsx'
import { useProject, useProjectStore } from './store/useProjectStore.js'
import { useSimulationJob } from './store/useSimulationJob.js'
import { useUiStore } from './store/useUiStore.js'
import AuthGate from './components/common/AuthGate.jsx'
import ConnectionsPage from './pages/ConnectionsPage.jsx'
import { useConnectionStore } from './store/useConnectionStore.js'
import { SERVER_STORAGE } from './store/useProjectStore.js'

/* 원본 index.html의 바깥 틀(aside + main + overlay + toast) */
function RootShell() {
  useSimulationJob()
  const filterModal = useUiStore((s) => s.filterModal)
  const dataStatus = useProjectStore((s) => s.dataStatus)
  const loadError = useProjectStore((s) => s.loadError)
  const loadProjects = useProjectStore((s) => s.loadProjects)
  useEffect(() => { void loadProjects() }, [loadProjects])
  useEffect(() => { if (SERVER_STORAGE) void useConnectionStore.getState().load() }, [])
  return (
    <>
      <Sidebar />
      <main>
        <Topbar />
        <div id="app">
          {dataStatus === 'loading' ? <section className="card" role="status">프로젝트를 불러오는 중입니다…</section>
            : dataStatus === 'error' ? <section className="card" role="alert"><h2>프로젝트를 불러오지 못했습니다</h2><p>{loadError}</p><button onClick={loadProjects}>다시 불러오기</button></section>
              : <><PersistenceNotice /><Outlet /></>}
        </div>
      </main>
      <div id="overlay">{filterModal ? <FilterModal key={filterModal} opts={filterModal} /> : <ConfirmModal />}</div>
      <Toast />
    </>
  )
}

/* 원본 go()의 "없는 프로젝트 ID → 프로젝트 목록" 처리 */
function ProjectGate() {
  const { projectId } = useParams()
  const project = useProject(projectId)
  if (!project) return <Navigate to="/" replace />
  return <Outlet />
}

/* 예전 주소(/runs)로 들어오면 결과 › 실행 기록으로 보낸다 */
function RunsRedirect() {
  const { projectId } = useParams()
  return <Navigate to={`/p/${projectId}/results`} replace />
}

/* 메뉴 구조: 개요 / 설계(설문·대상 집단·응답 모델) / 시뮬레이션 / 결과(실행 기록 → 실행 하나의 결과) */
function App() {
  return (
    <Routes>
      <Route element={<AuthGate><RootShell /></AuthGate>}>
        <Route index element={<ProjectsPage />} />
        <Route path="settings/connections" element={<ConnectionsPage />} />
        <Route path="p/:projectId" element={<ProjectGate />}>
          <Route index element={<SummaryPage />} />
          <Route path="design/survey" element={<SurveyPage />} />
          <Route path="design/target" element={<TargetPage />} />
          <Route path="design/model" element={<ModelPage />} />
          <Route path="simulation" element={<SimulationPage />} />
          <Route path="results" element={<RunsPage />} />
          <Route path="results/:runId" element={<ResultsPage />} />
          <Route path="results/:runId/interview" element={<InterviewPage />} />
          <Route path="runs" element={<RunsRedirect />} />
        </Route>
      </Route>
    </Routes>
  )
}

export default App
