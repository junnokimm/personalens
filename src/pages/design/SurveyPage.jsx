import { useState } from 'react'
import { useParams } from 'react-router-dom'

import Banner from '../../components/common/Banner.jsx'
import PageHead from '../../components/common/PageHead.jsx'
import { TYPE_LABEL, ordered, qLabel, surveyFlowState, validateSurvey, versionText } from '../../lib/survey.js'
import { useProject, useProjectStore } from '../../store/useProjectStore.js'
import { useUiStore } from '../../store/useUiStore.js'
import { DesignStepNav, DesignStepper } from './designSteps.jsx'
import QuestionSettings from './QuestionSettings.jsx'
import SurveyPreviewModal from './SurveyPreviewModal.jsx'
import { useFocusAfterRender } from './useFocusAfterRender.js'

/* 원본 surveyPage() */
export default function SurveyPage() {
  const { projectId } = useParams()
  const project = useProject(projectId)
  const [previewOpen, setPreviewOpen] = useState(false)
  const editS = useProjectStore((s) => s.editS)
  const addQ = useProjectStore((s) => s.addQ)
  const restoreVersion = useProjectStore((s) => s.restoreVersion)
  const editQ = useProjectStore((s) => s.editQ)
  const selQid = useUiStore((s) => s.selQid)
  const selectQ = useUiStore((s) => s.selectQ)
  const openConfirm = useUiStore((s) => s.openConfirm)
  const closeConfirm = useUiStore((s) => s.closeConfirm)
  const showToast = useUiStore((s) => s.showToast)
  const focusAfterRender = useFocusAfterRender()

  const s = project.survey
  const v = validateSurvey(s)
  const flow = surveyFlowState(s, project.runs.length > 0)
  const hist = s.history || []
  const used = (ver) => project.runs.filter((r) => r.survey.version === ver).length

  function handleRestoreVersion(ev) {
    const ver = ev.target.value
    ev.target.value = ''
    if (!ver) return
    openConfirm({
      title: `v${ver} 불러오기`,
      ok: '불러오기',
      body: <p>v{ver}의 문항을 편집 화면으로 불러옵니다. 지금 편집 중인 내용은 사라집니다. 다음 실행 때 v{s.version + 1}로 확정됩니다.</p>,
      onOk: () => {
        restoreVersion(project.id, ver)
        closeConfirm()
        showToast(`v${ver} 내용을 불러왔습니다.`)
      },
    })
  }
  /* 문항 고르기 — focus면 가운데 질문 칸으로 옮겨 바로 고칠 수 있게 한다('select'면 내용 전체 선택) */
  function select(qid, focus) {
    selectQ(qid)
    if (focus) focusAfterRender(`t-${qid}`, focus === 'select' ? 'select' : 'focus')
  }
  function handleAddQ(type) {
    select(addQ(project.id, type), true)
  }
  function handleFocusError(qid) {
    select(qid, true)
  }

  const verSel = hist.length ? (
    <label className="ver">
      <span>버전</span>
      <select aria-label="설문 버전" value="" onChange={handleRestoreVersion}>
        <option value="">{versionText(s)}{!s.draft && s.version ? ' (현재)' : ''}</option>
        {hist.slice().reverse().map((h) => (
          <option key={h.version} value={h.version}>v{h.version} 불러오기 · 실행 {used(h.version)}회 사용</option>
        ))}
      </select>
    </label>
  ) : (
    <span className="ver">
      <span>버전</span>
      <b>{versionText(s)}</b>
    </span>
  )

  const verNote = s.draft && s.version
    ? <span className="tag warn">v{s.version}에서 변경됨 · 다음 실행 때 v{s.version + 1}로 확정</span>
    : !s.version
      ? <span className="tag">아직 실행 전 · 첫 실행 때 v1로 확정</span>
      : <span className="tag ok">v{s.version} · 실행 {used(s.version)}회에 사용</span>

  const list = ordered(s)
  const sel = list.find((q) => q.id === selQid) || list[0]

  return (
    <>
      <PageHead title="설문" sub="문항을 만들고 순서를 정합니다. 버전은 입력할 때가 아니라 실행할 때 확정됩니다.">
        <button onClick={() => setPreviewOpen(true)}>설문 미리보기</button>
        {verSel}
      </PageHead>
      <DesignStepper project={project} current="survey" />
      <div className="ver-line">{verNote}</div>
      {flow.code === 'empty' ? (
        <Banner tone="todo">
          <b>먼저 설문 주제를 정해 보세요</b>
          <p className="small-text">주제를 입력한 뒤 아래 버튼으로 문항을 추가하세요. 척도형·단일선택·주관식 중에서 고를 수 있습니다.</p>
        </Banner>
      ) : v.summary.length ? (
        <Banner tone="bad">
          <b>확인할 내용 {v.summary.length}개</b>
          <ul>
            {v.summary.slice(0, 4).map((e) => (
              <li key={`${e.qid || 'survey'}:${e.msg}`}>{e.msg}{e.qid ? <> <button className="link" onClick={() => handleFocusError(e.qid)}>이동</button></> : null}</li>
            ))}
          </ul>
        </Banner>
      ) : null}
      <section className="card">
        <h2>설문 정보</h2>
        <p className="muted small-text">프로젝트의 메타 정보입니다. 개요와 시뮬레이션 화면에 표시되고, 페르소나에게도 조사 맥락으로 전달됩니다.</p>
        <div className="grid2">
          <div className="field">
            <label htmlFor="s-title">주제</label>
            <input id="s-title" value={s.title} className={!s.title.trim() && flow.code !== 'empty' ? 'invalid' : ''} onChange={(ev) => editS(project.id, 'title', ev.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="s-desc">목적</label>
            <input id="s-desc" value={s.description} onChange={(ev) => editS(project.id, 'description', ev.target.value)} />
          </div>
        </div>
      </section>
      <section className="card">
        <div className="card-top">
          <div>
            <h2>문항 {s.questions.length}개</h2>
            <p className="muted small-text">문항을 고르면 오른쪽에서 응답 형식과 점수 범위를 바꿉니다. 새 척도형 문항은 앞 척도형 문항의 설정을 이어받습니다.</p>
          </div>
          <div className="row">
            <button className="small" onClick={() => handleAddQ('likert')}>+ 척도형 문항</button>
            <button className="small" onClick={() => handleAddQ('choice')}>+ 단일선택 문항</button>
            <button className="small" onClick={() => handleAddQ('text')}>+ 주관식 문항</button>
          </div>
        </div>
        {list.length ? (
          <div className="sv-editor">
            <nav className="sv-outline" aria-label="문항 목록">
              <p className="sv-col-title">전체 문항</p>
              {list.map((q) => (
                <button key={q.id} className={`${q.id === sel.id ? 'on' : ''} ${q.parentId ? 'child' : ''}`} aria-current={q.id === sel.id ? 'true' : undefined} onClick={() => select(q.id, true)}>
                  <b>{qLabel(s, q)}</b>
                  <span>{q.text || '질문 내용 없음'}</span>
                  {v.byId[q.id] ? <i className="dot-err" title="확인 필요" /> : null}
                </button>
              ))}
            </nav>
            <div className="sv-rows">
              <p className="sv-col-title">질문 내용 <span className="muted">· 후속 질문은 앞 문항의 응답을 참고해 이어서 답하며, 번호는 Q1-1, Q1-2처럼 붙습니다.</span></p>
              {list.map((q) => {
                const label = qLabel(s, q)
                const e = v.byId[q.id]
                return (
                  <div key={q.id} id={`q-${q.id}`} className={`q-row ${q.id === sel.id ? 'on' : ''} ${q.parentId ? 'child' : ''}`} onClick={() => selectQ(q.id)}>
                    <span className="q-no">{label}</span>
                    <input
                      id={`t-${q.id}`}
                      aria-label={`${label} 질문 내용`}
                      placeholder="질문 내용을 입력하세요"
                      className={e?.text ? 'invalid' : ''}
                      value={q.text}
                      onFocus={() => selectQ(q.id)}
                      onChange={(ev) => editQ(project.id, q.id, 'text', ev.target.value)}
                    />
                    <span className="tag">{TYPE_LABEL[q.type]}{q.type === 'likert' ? ` · ${q.scale}점` : q.type === 'choice' ? ` · ${q.options.length + (q.otherEnabled ? 1 : 0)}개` : ''}</span>
                    {e ? <i className="dot-err" title="확인 필요" /> : <i className="dot-none" />}
                  </div>
                )
              })}
            </div>
            <QuestionSettings key={sel.id} projectId={project.id} survey={s} q={sel} errors={v.byId[sel.id]} onSelect={select} />
          </div>
        ) : <p className="empty">아직 문항이 없습니다. 위 버튼으로 문항을 추가하세요.</p>}
      </section>
      <DesignStepNav project={project} current="survey">
        {flow.code === 'empty' ? '주제와 문항을 입력하세요.'
          : flow.ready ? '버전은 시뮬레이션을 실행할 때 확정됩니다.'
            : '위 오류를 해결해야 시뮬레이션을 실행할 수 있습니다.'}
      </DesignStepNav>
      {previewOpen ? <SurveyPreviewModal survey={s} onClose={() => setPreviewOpen(false)} /> : null}
    </>
  )
}
