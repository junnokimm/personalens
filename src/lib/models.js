/* ---------- 응답 모델 (설계 3단계) ----------
 * 고른 값만 설계 상태(project.model)에 저장한다. 실제 모델 호출은 아직 연결하지 않았다.
 * note는 모델 차이를 한 줄로 설명할 자리 — 문구가 정해지기 전까지 placeholder로 둔다 */
export const RESPONSE_MODELS = [
  { id: 'glm', name: 'GLM', vendor: 'Zhipu AI', open: true, note: '(설명 준비 중) GLM의 응답 특징을 한 줄로 적습니다.' },
  { id: 'qwen', name: 'Qwen', vendor: 'Alibaba', open: true, note: '(설명 준비 중) Qwen의 응답 특징을 한 줄로 적습니다.' },
  { id: 'exaone', name: 'EXAONE', vendor: 'LG AI연구원', open: true, note: '(설명 준비 중) EXAONE의 응답 특징을 한 줄로 적습니다.' },
  { id: 'gpt', name: 'GPT', vendor: 'OpenAI', open: false, needsKey: true, note: '(설명 준비 중) GPT의 응답 특징을 한 줄로 적습니다.' },
]

export const responseModel = (id) => RESPONSE_MODELS.find((m) => m.id === id) || null
export const modelName = (id) => responseModel(id)?.name || '미선택'

/* 상태 코드(empty|needs-key|ready) — surveyFlowState·groupFlowState와 같은 방식.
 * API 키는 저장하지 않으므로(메모리에만 둠) 키가 필요한 모델은 hasKey를 따로 받는다 */
export function modelFlowState(model, hasKey, connections) {
  if (model?.connectionId) {
    const c = connections?.find((item) => item.id === model.connectionId)
    if (!c?.enabled || !['ready', 'manual'].includes(c.status) || !c.models.some((m) => m.id === model.modelId)) return { code: 'needs-connection', tone: 'warn', label: '연결 확인 필요', ready: false }
    return { code: 'ready', tone: 'info', label: `${model.modelId} 선택됨`, ready: true }
  }
  if (connections) return { code: 'empty', tone: 'todo', label: '모델 선택 전', ready: false }
  const m = responseModel(model?.id)
  if (!m) return { code: 'empty', tone: 'todo', label: '모델 선택 전', ready: false }
  if (m.needsKey && !hasKey) return { code: 'needs-key', tone: 'warn', label: `${m.name} · API 키 입력 필요`, ready: false }
  return { code: 'ready', tone: 'info', label: `${m.name} 선택됨`, ready: true }
}
