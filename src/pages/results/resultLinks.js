import { distribution } from '../../lib/analysis.js'
import { ANALYSIS_KEYS } from '../../lib/schema.js'

/* 결과 화면의 세 가지 관점(사이드바 결과 하위 메뉴)과 각 관점으로 들어가는 주소.
 * 페르소나 목록·상세·대화는 집단 분석에서 이어지는 화면이라 '집단별 분석'으로 묶는다 */
export const RESULT_SECTIONS = [
  { key: 'answers', label: '문항별 답변 보기' },
  { key: 'segment', label: '집단별 분석' },
  { key: 'interview', label: '페르소나 추가 인터뷰' },
]

export function resultSectionOf(page, view) {
  if (page === 'interview') return 'interview'
  if (page !== 'results') return null
  if (view === 'overall') return 'answers'
  if (['segment', 'personas', 'detail', 'chat'].includes(view)) return 'segment'
  return null
}

const firstChoiceQid = (run) => run.survey.questions.find((q) => q.type !== 'text')?.id || run.survey.questions[0].id

/* 집단별 분석은 "어떤 응답을 고른 사람들"이 기준이라, 메뉴로 바로 들어오면 첫 객관식 문항에서 가장 많이 고른 응답으로 시작한다 */
function segmentParams(run) {
  const qid = firstChoiceQid(run)
  const q = run.survey.questions.find((x) => x.id === qid)
  if (q.type === 'text') return new URLSearchParams({ view: 'overall', run: run.id, q: qid })
  const dist = distribution(run, qid)
  const answer = dist.reduce((best, d, i) => (d.count > dist[best].count ? i : best), 0)
  return new URLSearchParams({ view: 'segment', run: run.id, q: qid, answer: String(answer), seg: ANALYSIS_KEYS[0] })
}

export function resultSectionUrl(projectId, run, key) {
  const base = `/p/${projectId}/results/${run.id}`
  if (key === 'interview') return `${base}/interview`
  if (key === 'segment') return `${base}?${segmentParams(run)}`
  return `${base}?${new URLSearchParams({ view: 'overall', run: run.id, q: firstChoiceQid(run) })}`
}
