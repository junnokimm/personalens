import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

import PageHead from '../../components/common/PageHead.jsx'
import { RESPONSE_MODELS, responseModel } from '../../lib/models.js'
import { SERVER_STORAGE, useProject, useProjectStore } from '../../store/useProjectStore.js'
import { useUiStore } from '../../store/useUiStore.js'
import { DesignStepNav, DesignStepper } from './designSteps.jsx'
import { PROVIDER_NAMES, useConnectionStore } from '../../store/useConnectionStore.js'

/* 설계 3단계 · 응답 모델 — 고른 값을 설계 상태에 저장만 한다(실제 호출은 아직 연결하지 않음) */
export default function ModelPage() {
  const { projectId } = useParams()
  return SERVER_STORAGE ? <ConnectedModelPage key={projectId} /> : <LocalModelPage key={projectId} />
}

function ConnectedModelPage() {
  const { projectId } = useParams(), navigate = useNavigate()
  const project = useProject(projectId)
  const setModel = useProjectStore((s) => s.setConnectedModel)
  const { connections, loading, error, load } = useConnectionStore()
  const [browsing, setBrowsing] = useState(null)
  const connectionId = browsing ?? project.model?.connectionId ?? ''
  const connection = connections.find((c) => c.id === connectionId)
  const usable = connection?.enabled && ['ready', 'manual'].includes(connection.status)
  const selected = project.model?.connectionId === connectionId ? project.model?.modelId : ''
  const selectionExists = connections.some((c) => c.id === project.model?.connectionId && c.enabled && ['ready', 'manual'].includes(c.status) && c.models.some((m) => m.id === project.model.modelId))
  return <>
    <PageHead title="응답 모델" sub="등록한 연결에서 사용할 모델을 고릅니다. 선택은 프로젝트에 저장되어 다음 방문에도 이어집니다." />
    <DesignStepper project={project} current="model" />
    <section className="card">
      <h2>모델 선택</h2><p className="muted small-text">현재 시뮬레이션 응답은 시연 생성기가 만듭니다. 아래 모델로 실제 응답을 요청하는 기능은 다음 단계에서 연결합니다.</p>
      <div className="connection-picker"><div className="field"><label htmlFor="response-connection">사용할 연결</label><select id="response-connection" value={connectionId} onChange={(e) => setBrowsing(e.target.value)}>
        <option value="">연결을 선택하세요</option>
        {project.model?.connectionId && !connections.some((c) => c.id === project.model.connectionId) && <option value={project.model.connectionId}>저장된 연결 · 접근 불가</option>}
        {connections.map((c) => <option key={c.id} value={c.id}>{c.name} · {PROVIDER_NAMES[c.provider]}{c.enabled ? '' : ' · 사용 중지'}</option>)}
      </select></div><button onClick={() => navigate('/settings/connections')}>연결 관리</button><button onClick={load} disabled={loading}>목록 새로고침</button></div>
      {loading && <p role="status">모델 목록을 불러오는 중입니다…</p>}{error && <p role="alert" className="err-text">{error}</p>}
      {project.model?.id && <p className="connection-notice">기존 시연 모델 선택이 남아 있습니다. 등록한 연결에서 모델을 다시 선택하세요.</p>}
      {project.model?.connectionId && !selectionExists && !loading && <p className="err-text">저장된 모델을 현재 사용할 수 없습니다. 연결 상태와 모델 목록을 확인하세요.</p>}
      {connection && !usable && <p className="connection-notice">연결 관리에서 사용 설정과 모델 목록을 확인하세요. {connection.lastError}</p>}
      {connection?.status === 'manual' && <p className="connection-notice">직접 등록한 모델 ID입니다. 서버에서의 실행 가능 여부는 아직 확인하지 않았습니다.</p>}
      {usable && <div className="model-list" role="radiogroup" aria-label="응답 모델">{connection.models.map((m) => <label key={m.id} className={`model-opt ${selected === m.id ? 'on' : ''}`}>
        <input type="radio" name="connected-model" value={m.id} checked={selected === m.id} onChange={() => { setModel(projectId, connection.id, m.id); setBrowsing(null) }} />
        <span className="model-main"><b>{m.name}</b>{m.name !== m.id && <span className="muted small-text">{m.id}</span>}<span className="tag">{PROVIDER_NAMES[connection.provider]}</span></span>
        <span className="model-note">{m.source === 'manual' ? '직접 등록 · 실행 검증 전' : '공급자 모델 목록 · 실행 검증 전'}</span>
      </label>)}</div>}
      {usable && !connection.models.length && <p className="muted">선택 가능한 모델이 없습니다. 연결 관리에서 목록을 다시 조회하세요.</p>}
      {!connections.length && !loading && <p className="muted">먼저 OpenAI·Anthropic API 또는 DGX Spark 연결을 등록하세요.</p>}
    </section>
    <DesignStepNav project={project} current="model">{project.model?.modelId ? `선택한 모델: ${project.model.modelId}` : '사용할 연결과 모델을 선택하세요.'}</DesignStepNav>
  </>
}

function LocalModelPage() {
  const { projectId } = useParams()
  const project = useProject(projectId)
  const setModel = useProjectStore((s) => s.setModel)
  const apiKey = useUiStore((s) => s.apiKeys[projectId] || '')
  const setApiKey = useUiStore((s) => s.setApiKey)

  const selected = responseModel(project.model?.id)

  return (
    <>
      <PageHead title="응답 모델" sub="페르소나의 응답을 만들 언어 모델을 고릅니다. 실행 기록에 어떤 모델로 실행했는지 함께 남습니다." />
      <DesignStepper project={project} current="model" />
      <section className="card">
        <h2>모델 선택</h2>
        <p className="muted small-text">지금은 선택만 저장됩니다. 실제 응답은 아직 시연 생성기가 만듭니다.</p>
        <div className="model-list" role="radiogroup" aria-label="응답 모델">
          {RESPONSE_MODELS.map((m) => {
            const on = selected?.id === m.id
            return (
              <label key={m.id} className={`model-opt ${on ? 'on' : ''}`}>
                <input type="radio" name="response-model" value={m.id} checked={on} onChange={() => setModel(project.id, m.id)} />
                <span className="model-main">
                  <b>{m.name}</b>
                  <span className="muted small-text">{m.vendor}</span>
                  <span className={`tag ${m.open ? 'info' : ''}`}>{m.open ? '오픈 모델' : 'API 키 필요'}</span>
                </span>
                <span className="model-note">{m.note}</span>
              </label>
            )
          })}
        </div>
        {selected?.needsKey ? (
          <div className="field api-key">
            <label htmlFor="model-key">{selected.name} API 키</label>
            <input
              id="model-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="sk-..."
              value={apiKey}
              className={!apiKey.trim() ? 'invalid' : ''}
              onChange={(ev) => setApiKey(project.id, ev.target.value)}
            />
            <p className="muted small-text">키는 이 탭의 메모리에만 두고 브라우저 저장소에 남기지 않습니다. 새로고침하면 다시 입력해야 합니다.</p>
            {!apiKey.trim() ? <p className="err-text">API 키를 입력하세요.</p> : null}
          </div>
        ) : null}
      </section>
      <DesignStepNav project={project} current="model">
        {selected ? `선택한 모델: ${selected.name} · 실행할 때 실행 기록에 함께 남습니다.` : '응답을 만들 모델을 하나 고르세요.'}
      </DesignStepNav>
    </>
  )
}
