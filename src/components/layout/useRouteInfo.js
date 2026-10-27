import { useMatch, useSearchParams } from 'react-router-dom'

/* 원본 page 전역 변수에 해당하는 값을 현재 경로에서 읽는다(경로 정의는 App.jsx와 맞춰 둔다).
   useMatches()는 데이터 라우터(createBrowserRouter)에서만 동작해 쓰지 않음 */
export function useRouteInfo() {
  const runsMatch = useMatch('/p/:projectId/results')
  const interviewMatch = useMatch('/p/:projectId/results/:runId/interview')
  const resultsMatch = useMatch('/p/:projectId/results/:runId')
  const surveyMatch = useMatch('/p/:projectId/design/survey')
  const targetMatch = useMatch('/p/:projectId/design/target')
  const modelMatch = useMatch('/p/:projectId/design/model')
  const simMatch = useMatch('/p/:projectId/simulation')
  const summaryMatch = useMatch('/p/:projectId')
  const [searchParams] = useSearchParams()

  const match = runsMatch || interviewMatch || resultsMatch || surveyMatch || targetMatch || modelMatch || simMatch || summaryMatch
  const page = runsMatch ? 'runs'
    : interviewMatch ? 'interview'
      : resultsMatch ? 'results'
        : surveyMatch ? 'survey'
          : targetMatch ? 'target'
            : modelMatch ? 'model'
              : simMatch ? 'simulation'
                : summaryMatch ? 'summary'
                  : undefined

  return {
    page,
    projectId: match?.params.projectId,
    runId: (interviewMatch || resultsMatch)?.params.runId,
    /* 결과 화면 안의 보기(?view=) — 사이드바에서 결과 하위 메뉴를 강조할 때 쓴다 */
    resultView: resultsMatch ? searchParams.get('view') || 'overall' : null,
  }
}
