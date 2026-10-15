import { Navigate, Outlet, Route, Routes, useParams } from 'react-router-dom'

import ConfirmModal from './components/common/ConfirmModal.jsx'
import Toast from './components/common/Toast.jsx'
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
import { useProject } from './store/useProjectStore.js'
import { useSimulationJob } from './store/useSimulationJob.js'
import { useUiStore } from './store/useUiStore.js'

/* 원본 index.html의 바깥 틀(aside + main + overlay + toast) */
function RootShell() {
  useSimulationJob()
  const filterModal = useUiStore((s) => s.filterModal)
  return (
    <>
      <Sidebar />
      <main>
        <Topbar />
        <div id="app"><Outlet /></div>
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
      <Route element={<RootShell />}>
        <Route index element={<ProjectsPage />} />
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
