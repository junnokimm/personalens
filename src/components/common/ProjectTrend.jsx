import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { SERVER_STORAGE, useProjectStore } from '../../store/useProjectStore.js'
import { useTrend, useTrendStore } from '../../store/useTrendStore.js'
import { completedTrendRuns, readTrendChoice, saveTrendChoice, selectedTrendRun } from '../../lib/trends.js'
import { stamp } from '../../utils/format.js'

function TrendResult({ run, projectId }) {
  const { data, loading, error } = useTrend(run)
  const load = useTrendStore((s) => s.load)
  const retry = useTrendStore((s) => s.retry)
  const navigate = useNavigate()
  const mode = run.engine?.kind === 'openai' ? run.engine.mock ? '모의 LLM 요약' : 'LLM 요약' : '시연 통계 요약 · LLM 미사용'
  const model = run.engine?.kind === 'openai' ? run.engine.selectedModel?.modelId : ''
  const evidence = data?.evidence
  const questionMap = new Map(evidence?.questions?.map((q) => [q.id, q]) || [])
  return <>
    <p className="trend-meta">실행 #{run.number} · {run.groupName} · {(run.peopleCount ?? run.people?.length ?? 0).toLocaleString()}명 · {mode}{model ? ` · ${model}` : ''}</p>
    {!run._server ? <p className="muted">브라우저 시연 실행입니다. LLM 추세 요약은 서버에서 완료한 실행에서 제공합니다.</p>
      : error ? <div role="alert"><p className="err-text">{error}</p><button className="small" disabled={loading} onClick={() => load(run.id)}>요약 다시 불러오기</button></div>
        : !data || ['missing', 'queued', 'running'].includes(data.status) ? <p className="muted" role="status">{data?.status === 'queued' ? '추세 요약을 기다리는 중입니다. 서버가 처리하며, 화면을 닫아도 계속됩니다.' : data?.status === 'running' ? '저장된 응답을 바탕으로 추세를 요약하고 있습니다…' : '추세 요약을 불러오는 중입니다…'}</p>
          : data.status === 'failed' ? <div role="alert"><p className="err-text">요약을 만들지 못했습니다. {data.error}</p>{data.usage.attempts < 3 && <button className="small" disabled={loading} onClick={() => retry(run.id)}>요약 재시도</button>}</div>
            : <div aria-live="polite">
              <h3 className="trend-headline">{data.content.headline}</h3>
              <p className="trend-overview">{data.content.overview}</p>
              {!!data.content.keyPoints.length && <ul className="trend-points">{data.content.keyPoints.map((point, index) => <li key={index}>{point.text} <span className="muted small-text">({point.questionIds.map((id) => `문항 ${questionMap.get(id)?.number}`).join(', ')})</span></li>)}</ul>}
              <details className="trend-evidence"><summary>근거 응답 분포 · {evidence.responseCount.toLocaleString()}개 응답</summary>
                {evidence.questions.map((q) => <div className="trend-question" key={q.id}>
                  <b>문항 {q.number}. {q.text}</b>
                  {q.distribution.length ? <div className="trend-distribution">{q.distribution.map((option) => <span key={option.answer}>{option.label} <strong>{option.percent}%</strong> <small>({option.count.toLocaleString()}명)</small></span>)}</div> : <p className="muted small-text">서술형 유효 응답 {q.valid.toLocaleString()}개</p>}
                  <small className="muted">비율 기준: 이 문항의 유효 응답 {q.valid.toLocaleString()}명 · 누락 {q.missing.toLocaleString()}명</small>
                </div>)}
              </details>
              <p className="muted small-text">{stamp(data.updated)} 저장 · 합성 페르소나 응답 기준입니다.{run.engine?.kind === 'openai' ? evidence.textSampleCount > 0 ? ` 서술형·기타 의견 ${evidence.textSampleCount}개 발췌를 참고하며, 발췌 빈도는 전체 의견 비율이 아닙니다.` : '' : ' 시연 모드에서는 서술형 의견의 의미를 요약하지 않습니다.'}{evidence.includedQuestionCount < evidence.questionCount ? ` 입력 한도로 전체 ${evidence.questionCount}문항 중 앞 ${evidence.includedQuestionCount}문항을 요약했습니다.` : ''}</p>
            </div>}
    <div className="trend-footer"><span className="muted small-text">{run.engine?.kind === 'openai' ? '실행 당시 모델로 처음 한 번 생성해 DB에 저장합니다. 새로고침 시 저장된 요약을 불러옵니다.' : '선택한 실행의 저장된 응답을 기준으로 표시합니다.'}</span><button className="small" onClick={() => navigate(`/p/${projectId}/results/${run.id}`)}>해당 실행 결과 보기</button></div>
  </>
}

export default function ProjectTrend({ project }) {
  const [params, setParams] = useSearchParams()
  const [remembered, setRemembered] = useState(() => readTrendChoice(project.id))
  const loaded = useProjectStore((s) => s.runsLoaded)
  const runsError = useProjectStore((s) => s.runsError)
  const refresh = useProjectStore((s) => s.refreshRuns)
  const runs = completedTrendRuns(project.runs)
  const requested = params.get('trendRun') || remembered
  const choice = requested === 'latest' || runs.some((r) => r.id === requested) ? requested : 'latest'
  const run = selectedTrendRun(runs, choice)
  function choose(value) {
    setRemembered(value)
    saveTrendChoice(project.id, value)
    const next = new URLSearchParams(params)
    next.set('trendRun', value)
    setParams(next, { replace: true })
  }
  return <section className="card project-trend" aria-labelledby="project-trend-title">
    <div className="trend-top"><h2 id="project-trend-title">프로젝트 추세</h2>
      {!!runs.length && <div className="trend-picker"><label htmlFor="trend-run">요약할 실행</label><select id="trend-run" value={choice} onChange={(e) => choose(e.target.value)}>
        <option value="latest">최근 완료 · 실행 #{runs[0].number}</option>
        {runs.map((r) => <option key={r.id} value={r.id}>실행 #{r.number} · {stamp(r.created)}</option>)}
      </select></div>}
    </div>
    {SERVER_STORAGE && runsError ? <p role="alert" className="err-text">실행 목록을 불러오지 못했습니다. <button className="small" onClick={refresh}>다시 불러오기</button></p>
      : SERVER_STORAGE && !loaded ? <p className="muted" role="status">실행 목록을 확인하고 있습니다…</p>
        : run ? <TrendResult key={run.id} run={run} projectId={project.id} />
          : <p className="muted trend-empty">아직 추세가 없습니다. 시뮬레이션을 완료하면 의견 요약을 확인할 수 있습니다.</p>}
  </section>
}
