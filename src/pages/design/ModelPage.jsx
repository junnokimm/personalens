import { useParams } from 'react-router-dom'

import PageHead from '../../components/common/PageHead.jsx'
import { RESPONSE_MODELS, responseModel } from '../../lib/models.js'
import { useProject, useProjectStore } from '../../store/useProjectStore.js'
import { useUiStore } from '../../store/useUiStore.js'
import { DesignStepNav, DesignStepper } from './designSteps.jsx'

/* 설계 3단계 · 응답 모델 — 고른 값을 설계 상태에 저장만 한다(실제 호출은 아직 연결하지 않음) */
export default function ModelPage() {
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
