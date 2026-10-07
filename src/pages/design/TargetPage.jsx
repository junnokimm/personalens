import { useParams } from 'react-router-dom'

import Banner from '../../components/common/Banner.jsx'
import PageHead from '../../components/common/PageHead.jsx'
import FilterChips from '../../components/filters/FilterChips.jsx'
import { groupError, groupStale } from '../../lib/cohort.js'
import { CONFIG } from '../../lib/config.js'
import { attrLabel, estimateCount } from '../../lib/schema.js'
import { useProject, useProjectStore } from '../../store/useProjectStore.js'
import { useUiStore } from '../../store/useUiStore.js'
import GroupPreview from './GroupPreview.jsx'
import { useFocusAfterRender } from './useFocusAfterRender.js'

/* 원본 targetPage() */
export default function TargetPage() {
  const { projectId } = useParams()
  const project = useProject(projectId)
  const selectGroup = useProjectStore((s) => s.selectGroup)
  const renameGroup = useProjectStore((s) => s.renameGroup)
  const dupGroup = useProjectStore((s) => s.dupGroup)
  const delGroup = useProjectStore((s) => s.delGroup)
  const addGroup = useProjectStore((s) => s.addGroup)
  const setGroupCount = useProjectStore((s) => s.setGroupCount)
  const removeTargetFilter = useProjectStore((s) => s.removeTargetFilter)
  const applyTargetFilter = useProjectStore((s) => s.applyTargetFilter)
  const buildCohort = useProjectStore((s) => s.buildCohort)
  const openFilterModal = useUiStore((s) => s.openFilterModal)
  const openConfirm = useUiStore((s) => s.openConfirm)
  const closeConfirm = useUiStore((s) => s.closeConfirm)
  const showToast = useUiStore((s) => s.showToast)
  const focusAfterRender = useFocusAfterRender()

  const g = project.groups.find((x) => x.id === project.activeGroupId) || project.groups[0]
  const est = estimateCount(g.filters)
  const stale = groupStale(g)
  const err = groupError(g)
  const usedBy = (id) => project.runs.filter((r) => r.groupId === id).length

  function handleAddGroup() {
    addGroup(project.id)
    focusAfterRender('g-name', 'select')
  }
  function handleDelGroup() {
    openConfirm({
      title: '대상 집단 삭제',
      danger: true,
      ok: '삭제',
      body: <p>“{g.name}”을 삭제합니다. 이 집단으로 실행한 결과는 남습니다.</p>,
      onOk: () => { delGroup(project.id, g.id); closeConfirm() },
    })
  }
  function handleOpenTargetFilter() {
    openFilterModal({
      mode: 'target', title: '대상 조건 선택', filters: g.filters, need: g.count, start: 'age',
      onApply: (f) => applyTargetFilter(project.id, g.id, f),
    })
  }
  function handleBuild() {
    const result = buildCohort(project.id, g.id)
    if (!result.ok) { showToast(result.error); return }
    showToast(`${g.name} · ${g.count}명을 구성했습니다.`)
  }

  return (
    <>
      <PageHead title="대상 집단" sub="설문을 받을 합성 페르소나 집단을 조건으로 정의합니다. 여러 집단을 저장해 두고 실행할 때 고를 수 있습니다." />
      <div className="target-layout">
        <div className="group-list">
          {project.groups.map((x) => (
            <button key={x.id} className={`group-item ${x.id === g.id ? 'on' : ''}`} onClick={() => selectGroup(project.id, x.id)}>
              <b>{x.name}</b>
              <span>{x.count}명 · {groupStale(x) ? <em className="warn-text">구성 필요</em> : '구성 완료'}</span>
              <small>{Object.keys(x.filters).length ? Object.keys(x.filters).map((k) => attrLabel(k)).slice(0, 3).join(', ') : '조건 없음'} · 실행 {usedBy(x.id)}회</small>
            </button>
          ))}
          <button className="small add-group" onClick={handleAddGroup}>+ 새 대상 집단</button>
        </div>
        <div>
          <section className="card">
            <div className="card-top">
              <div className="field name-field">
                <label htmlFor="g-name">집단 이름</label>
                <input id="g-name" value={g.name} onChange={(ev) => renameGroup(project.id, g.id, ev.target.value)} />
              </div>
              <div className="row">
                <button className="small" onClick={() => dupGroup(project.id)}>복제</button>
                <button className="small" disabled={project.groups.length < 2} onClick={handleDelGroup}>삭제</button>
              </div>
            </div>
            <div className="cond-box">
              <div className="card-top"><h3>대상 조건</h3><button className="small" onClick={handleOpenTargetFilter}>조건 선택</button></div>
              <FilterChips filters={g.filters} onRemove={(key) => removeTargetFilter(project.id, g.id, key)} />
              <p className={`estimate ${est.estimate < g.count ? 'warn-text' : ''}`}>
                조건에 맞는 페르소나 <b>약 {est.estimate.toLocaleString()}명</b> / {est.total.toLocaleString()}명 <span className="muted small-text">(항목끼리 독립이라고 가정한 추정치)</span>
              </p>
            </div>
            <div className="row align-end">
              <div className="field count-field">
                <label htmlFor="g-count">페르소나 수 ({CONFIG.MIN_PERSONAS}~{CONFIG.MAX_PERSONAS}명)</label>
                <input id="g-count" type="number" min={CONFIG.MIN_PERSONAS} max={CONFIG.MAX_PERSONAS} value={g.count} className={err ? 'invalid' : ''} onChange={(ev) => setGroupCount(project.id, g.id, Number(ev.target.value))} />
              </div>
              <button className="primary" disabled={!!err} onClick={handleBuild}>{g.cohort ? '대상 집단 다시 구성' : '대상 집단 구성'}</button>
            </div>
            {err ? <p className="err-text">{err}</p> : null}
            {est.estimate < g.count ? <p className="warn-text small-text">조건에 맞는 인원이 구성할 인원보다 적을 수 있습니다. 조건을 줄이거나 인원을 낮추세요.</p> : null}
            {stale && g.cohort ? <Banner tone="warn">조건이 바뀌었습니다. 아래 미리보기는 이전 조건 기준입니다. 다시 구성해야 실행에 반영됩니다.</Banner> : null}
            {g.cohort?.textFiltersIgnored?.length ? <p className="muted small-text">서술 조건({g.cohort.textFiltersIgnored.join(', ')})은 시연 데이터에 서술이 없어 구성에 적용되지 않았습니다.</p> : null}
          </section>
          {g.cohort ? <GroupPreview group={g} stale={stale} /> : (
            <section className="card"><h2>미리보기</h2><p className="empty">아직 구성하지 않았습니다. 조건을 고른 뒤 “대상 집단 구성”을 누르세요.</p></section>
          )}
        </div>
      </div>
    </>
  )
}
