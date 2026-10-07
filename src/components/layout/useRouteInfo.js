import { useMatch } from 'react-router-dom'

/* 원본 page 전역 변수에 해당하는 값을 현재 경로에서 읽는다(경로 정의는 App.jsx와 맞춰 둔다).
   useMatches()는 데이터 라우터(createBrowserRouter)에서만 동작해 쓰지 않음 */
export function useRouteInfo() {
  const runsMatch = useMatch('/p/:projectId/runs')
  const resultsMatch = useMatch('/p/:projectId/results/:runId?')
  const surveyMatch = useMatch('/p/:projectId/design/survey')
  const targetMatch = useMatch('/p/:projectId/design/target')
  const simMatch = useMatch('/p/:projectId/simulation')
  const summaryMatch = useMatch('/p/:projectId')

  const match = runsMatch || resultsMatch || surveyMatch || targetMatch || simMatch || summaryMatch
  const page = runsMatch ? 'runs'
    : resultsMatch ? 'results'
      : surveyMatch ? 'survey'
        : targetMatch ? 'target'
          : simMatch ? 'simulation'
            : summaryMatch ? 'summary'
              : undefined

  return { page, projectId: match?.params.projectId, runId: resultsMatch?.params.runId }
}
