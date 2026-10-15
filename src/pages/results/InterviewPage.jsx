import { Navigate, useParams } from 'react-router-dom'

import ComingSoon from '../../components/common/ComingSoon.jsx'
import PageHead from '../../components/common/PageHead.jsx'
import { useProject } from '../../store/useProjectStore.js'

/* 결과 › 페르소나 추가 인터뷰 — 경로와 빈 화면만 둔다 */
export default function InterviewPage() {
  const { projectId, runId } = useParams()
  const project = useProject(projectId)
  const run = project.runs.find((r) => r.id === runId)
  if (!run) return <Navigate to={`/p/${project.id}/results/${runId}`} replace />

  return (
    <>
      <PageHead title="페르소나 추가 인터뷰" sub={`실행 #${run.number}의 페르소나에게 설문 밖의 질문을 이어서 묻는 화면입니다.`} />
      <ComingSoon what="페르소나 추가 인터뷰">
        <p>지금은 집단별 분석 › 페르소나 상세에서 문항별 응답 이유를 묻는 시연용 대화만 쓸 수 있습니다.</p>
      </ComingSoon>
    </>
  )
}
