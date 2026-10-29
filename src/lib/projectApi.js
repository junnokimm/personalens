export class ApiError extends Error {
  constructor(message, status, code) {
    super(message)
    this.status = status
    this.code = code
  }
}

let sessionIdentity = ''
export function setSessionIdentity(id) { sessionIdentity = id }
export function getSessionIdentity() { return sessionIdentity }

export async function request(path, options = {}) {
  const { timeout: timeoutMs = 15000, signal, ...fetchOptions } = options
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (signal?.aborted) abort()
  signal?.addEventListener('abort', abort, { once: true })
  const timeout = setTimeout(abort, timeoutMs)
  try {
    const response = await fetch(`/api/v1${path}`, {
      ...fetchOptions,
      signal: controller.signal,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Persona-Request': '1',
        ...(sessionIdentity ? { 'X-Persona-User': sessionIdentity } : {}), ...options.headers },
    })
    const body = await response.json().catch(() => null)
    if (!response.ok) {
      if (response.status === 401 && sessionIdentity && typeof window !== 'undefined') window.dispatchEvent(new Event('persona-session-expired'))
      throw new ApiError(body?.error?.message || '서버에 저장하지 못했습니다.', response.status, body?.error?.code)
    }
    if (!body) throw new ApiError('서버 응답을 읽지 못했습니다.', 502, 'INVALID_RESPONSE')
    return body
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError('서버에 연결하지 못했습니다. 연결을 확인한 뒤 다시 시도하세요.', 0, 'NETWORK_ERROR')
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}

export const projectApi = {
  getCohort: (projectId, id) => request('/projects/' + encodeURIComponent(projectId) + '/cohorts/' + encodeURIComponent(id)),
  list: () => request('/projects'),
  get: (id) => request(`/projects/${encodeURIComponent(id)}`),
  save: (operation) => request(operation.expectedRevision === 0 ? '/projects' : `/projects/${encodeURIComponent(operation.document.id)}`, {
    method: operation.expectedRevision === 0 ? 'POST' : 'PUT',
    body: JSON.stringify(operation),
  }),
}

// Explicit allowlist: API keys, demo responses, chats and UI state never enter the request.
export function projectDocument(project) {
  const { id, name, description, survey, groups, activeGroupId } = project
  const model = project.model?.connectionId ? { connectionId: project.model.connectionId, modelId: project.model.modelId }
    : project.model?.id ? { id: project.model.id } : null
  const drafts = groups.map((g) => ({ ...g, cohort: g.cohort?.id ? { id: g.cohort.id } : g.cohort }))
  return structuredClone({ id, name, description, survey: surveyContent(survey), groups: drafts, activeGroupId, model })
}

export function surveyContent(survey) {
  const { version: _version, history: _history, draft: _draft, ...content } = survey
  return content
}

export function stableJson(value) {
  return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)
}
