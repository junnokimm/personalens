// The confirmation and request share this decision: never silently substitute demo for OpenAI.
export function executionFor(model, state) {
  const demo = { engine: 'demo', label: '서버 시연 생성기 · 외부 모델 호출 없음', error: '' }
  if (!model?.connectionId) return demo
  if (!state.loaded) return { ...demo, error: '모델 연결 정보를 불러오는 중입니다.' }
  if (state.error) return { ...demo, error: state.error }
  const row = state.connections.find((c) => c.id === model.connectionId)
  if (!row) return { ...demo, error: '선택한 연결에 접근할 수 없습니다. 모델을 다시 선택하세요.' }
  if (row.provider !== 'openai' || !state.openaiInferenceEnabled) return demo
  const execution = { engine: 'openai', selection: { connectionId: model.connectionId, modelId: model.modelId },
    label: `${state.mockMode ? '모의 OpenAI 검증' : 'OpenAI 실제 응답'} · ${model.modelId}`, error: '' }
  if (!row.inferenceReady || !row.models.some((m) => m.id === model.modelId)) execution.error = '현재 환경의 OpenAI 연결을 등록·확인하고 모델을 다시 선택하세요.'
  return execution
}

export function engineLabel(run) {
  return run.engine?.kind === 'openai'
    ? `${run.engine.mock ? '모의 OpenAI 검증' : 'OpenAI 실제 응답'} · ${run.engine.selectedModel?.modelId}`
    : run._server ? '서버 시연 응답' : '이전 로컬 시연 응답'
}
