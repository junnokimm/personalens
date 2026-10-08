import { useParams } from 'react-router-dom'

import Banner from '../../components/common/Banner.jsx'
import PageHead from '../../components/common/PageHead.jsx'
import { validateSurvey, versionText } from '../../lib/survey.js'
import { useProject, useProjectStore } from '../../store/useProjectStore.js'
import { useUiStore } from '../../store/useUiStore.js'
import QuestionBlock from './QuestionBlock.jsx'
import { useFocusAfterRender } from './useFocusAfterRender.js'

/* 원본 surveyPage() */
export default function SurveyPage() {
  const { projectId } = useParams()
  const project = useProject(projectId)
  const editS = useProjectStore((s) => s.editS)
  const addQ = useProjectStore((s) => s.addQ)
  const restoreVersion = useProjectStore((s) => s.restoreVersion)
  const openQ = useUiStore((s) => s.openQ)
  const openConfirm = useUiStore((s) => s.openConfirm)
  const closeConfirm = useUiStore((s) => s.closeConfirm)
  const showToast = useUiStore((s) => s.showToast)
  const focusAfterRender = useFocusAfterRender()

  const s = project.survey
  const v = validateSurvey(s)
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
  function handleAddQ(type) {
    const qid = addQ(project.id, type)
    openQ(qid)
    focusAfterRender(`t-${qid}`)
  }
  function handleFocusError(qid) {
    openQ(qid)
    focusAfterRender(`q-${qid}`, 'scroll')
  }

  const verSel = (
    <label className="ver">
      <span>버전</span>
      <select aria-label="설문 버전" value="" onChange={handleRestoreVersion}>
        <option value="">{versionText(s)}{!s.draft && s.version ? ' (현재)' : ''}</option>
        {hist.slice().reverse().map((h) => (
          <option key={h.version} value={h.version}>v{h.version} 불러오기 · 실행 {used(h.version)}회 사용</option>
        ))}
      </select>
    </label>
  )

  const verNote = s.draft && s.version
    ? <span className="tag warn">v{s.version}에서 변경됨 · 다음 실행 때 v{s.version + 1}로 확정</span>
    : !s.version
      ? <span className="tag">아직 실행 전 · 첫 실행 때 v1로 확정</span>
      : <span className="tag ok">v{s.version} · 실행 {used(s.version)}회에 사용</span>

  const tops = s.questions.filter((q) => !q.parentId)

  return (
    <>
      <PageHead title="설문" sub="문항을 만들고 순서를 정합니다. 버전은 입력할 때가 아니라 실행할 때 확정됩니다.">
        {verSel}
      </PageHead>
      <div className="ver-line">{verNote}</div>
      {v.summary.length ? (
        <Banner tone="bad">
          <b>확인할 내용 {v.summary.length}개</b>
          <ul>
            {v.summary.slice(0, 4).map((e, i) => (
              <li key={i}>{e.msg}{e.qid ? <> <button className="link" onClick={() => handleFocusError(e.qid)}>이동</button></> : null}</li>
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
            <input id="s-title" value={s.title} className={!s.title.trim() ? 'invalid' : ''} onChange={(ev) => editS(project.id, 'title', ev.target.value)} />
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
            <p className="muted small-text">후속 질문은 앞 문항의 답을 기억한 채 이어서 답합니다. 번호는 Q1-1, Q1-2처럼 자동으로 붙습니다.</p>
          </div>
          <div className="row">
            <button className="small" onClick={() => handleAddQ('likert')}>+ 척도형 문항</button>
            <button className="small" onClick={() => handleAddQ('choice')}>+ 단일선택 문항</button>
            <button className="small" onClick={() => handleAddQ('text')}>+ 주관식 문항</button>
          </div>
        </div>
        <div className="qlist">
          {tops.length ? tops.flatMap((t, i) => {
            const kids = s.questions.filter((c) => c.parentId === t.id)
            return [
              <QuestionBlock key={t.id} projectId={project.id} survey={s} q={t} index={i} siblingCount={tops.length} errors={v.byId[t.id]} />,
              ...kids.map((c, j) => (
                <QuestionBlock key={c.id} projectId={project.id} survey={s} q={c} index={j} siblingCount={kids.length} errors={v.byId[c.id]} />
              )),
            ]
          }) : <p className="empty">아직 문항이 없습니다. 위 버튼으로 문항을 추가하세요.</p>}
        </div>
      </section>
    </>
  )
}
