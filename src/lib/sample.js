import { uid } from './random'
import { question } from './survey'
import { buildCohort, group } from './cohort'
import { createRun } from './simulation'

/* ---------- 예시 프로젝트 ---------- */
export function sample() {
  const p = { id: uid('project'), name: '구독 서비스 이용 경험 조사', description: '새로운 구독 서비스를 기획하기 전에 이용자의 기대와 선택 기준을 살펴봅니다.', updated: new Date().toISOString(), survey: null, groups: [], activeGroupId: null, runs: [], chats: {} }
  const q1 = { ...question('likert'), text: '나에게 맞는 콘텐츠를 추천해 주는 구독 서비스를 이용하고 싶다.', low: '전혀 동의하지 않음', high: '매우 동의함' }
  const q1b = { ...question('choice', q1.id), text: '방금 그렇게 답한 가장 큰 이유는 무엇인가요?', options: ['시간을 아낄 수 있어서', '새로운 콘텐츠를 찾고 싶어서', '추천을 믿기 어려워서', '개인정보가 걱정돼서'] }
  const q2 = { ...question('choice'), text: '구독 서비스를 선택할 때 가장 중요하게 보는 요소는 무엇인가요?', options: ['가격', '콘텐츠의 다양성', '개인 맞춤 추천', '이용 편의성'] }
  const q3 = { ...question('choice'), text: '새로운 서비스를 어떤 방식으로 경험하고 싶나요?', otherEnabled: true, options: ['무료 체험', '월간 구독', '필요할 때 단건 결제'] }
  p.survey = { title: '일상 속 디지털 구독 서비스', description: '구독 서비스의 이용 의향과 선택 기준을 탐색하기 위한 예시 조사입니다.', version: 0, draft: true, history: [], questions: [q1, q1b, q2, q3] }
  const g1 = { ...group('기본 집단'), count: 120, filters: { age: ['20대', '30대', '40대', '50대', '60대'] } }
  const g2 = { ...group('수도권 20·30대'), count: 80, filters: { age: ['20대', '30대'], region: ['서울', '경기', '인천'] } }
  p.groups = [g1, g2]; p.activeGroupId = g1.id
  buildCohort(g1); buildCohort(g2)
  const run = createRun(p, g1); run.status = 'completed'; run.progress = 100; p.runs = [run]
  const pid = run.people[1].id
  p.chats[run.id + '::' + pid] = [{ qid: q1.id, question: '그렇게 답한 이유가 궁금해요', answer: '(시연 대화) 추천이 정확하면 시간을 아낄 수 있을 것 같아 긍정적으로 답했습니다.', created: new Date().toISOString() }]
  return p
}
