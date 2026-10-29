import { describe, it, expect } from 'vitest'
import { executionFor, engineLabel } from './execution.js'

const model = { connectionId: 'c1', modelId: 'gpt-test' }
const state = { loaded: true, openaiInferenceEnabled: true, mockMode: false,
  connections: [{ id: 'c1', provider: 'openai', inferenceReady: true, models: [{ id: 'gpt-test' }] }] }

describe('execution confirmation', () => {
  it('sends the selected model with an explicit real execution request', () => {
    expect(executionFor(model, state)).toMatchObject({ engine: 'openai', selection: model, error: '' })
    expect(executionFor(model, state).label).toContain('실제 응답')
  })
  it('blocks stale or unavailable OpenAI connections instead of returning demo', () => {
    const result = executionFor(model, { ...state, connections: [{ ...state.connections[0], inferenceReady: false }] })
    expect(result.engine).toBe('openai')
    expect(result.error).not.toBe('')
    expect(executionFor(model, { ...state, loaded: false }).error).not.toBe('')
  })
  it('preserves explicit unselected/demo and labels mock results separately', () => {
    expect(executionFor(null, state).engine).toBe('demo')
    expect(executionFor(model, { ...state, openaiInferenceEnabled: false }).engine).toBe('demo')
    expect(engineLabel({ engine: { kind: 'openai', mock: true, selectedModel: model } })).toContain('모의')
    expect(engineLabel({ engine: { kind: 'openai', mock: false, selectedModel: model } })).toContain('실제')
  })
})
