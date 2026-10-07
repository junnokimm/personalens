import { Navigate, Outlet, Route, Routes, useParams } from 'react-router-dom'

import ConfirmModal from './components/common/ConfirmModal.jsx'
import Toast from './components/common/Toast.jsx'
import FilterModal from './components/filters/FilterModal.jsx'
import Sidebar from './components/layout/Sidebar.jsx'
import Topbar from './components/layout/Topbar.jsx'
import ProjectsPage from './pages/ProjectsPage.jsx'
import SummaryPage from './pages/overview/SummaryPage.jsx'
import RunsPage from './pages/overview/RunsPage.jsx'
import SurveyPage from './pages/design/SurveyPage.jsx'
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

/* 다음 단계에서 채울 화면들의 자리표시자 */
function Placeholder({ label }) {
  return <p className="muted">{label} 화면은 다음 단계에서 만듭니다.</p>
}

function App() {
  return (
    <Routes>
      <Route element={<RootShell />}>
        <Route index element={<ProjectsPage />} />
        <Route path="p/:projectId" element={<ProjectGate />}>
          <Route index element={<SummaryPage />} handle={{ page: 'summary' }} />
          <Route path="runs" element={<RunsPage />} handle={{ page: 'runs' }} />
          <Route path="results/:runId?" element={<Placeholder label="결과" />} handle={{ page: 'results' }} />
          <Route path="design/survey" element={<SurveyPage />} handle={{ page: 'survey' }} />
          <Route path="design/target" element={<Placeholder label="대상 집단" />} handle={{ page: 'target' }} />
          <Route path="simulation" element={<Placeholder label="시뮬레이션" />} handle={{ page: 'simulation' }} />
        </Route>
      </Route>
    </Routes>
  )
}

export default App
