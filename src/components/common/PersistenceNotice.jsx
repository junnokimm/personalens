import { projectDocument } from '../../lib/projectApi.js'
import { SERVER_STORAGE, useProjectStore } from '../../store/useProjectStore.js'
import { useUiStore } from '../../store/useUiStore.js'

function downloadDraft(project) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(projectDocument(project), null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `personalens-draft-${project.id}.json`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function PersistenceNotice() {
  const sync = useProjectStore((s) => s.sync)
  const projects = useProjectStore((s) => s.projects)
  const retry = useProjectStore((s) => s.retrySave)
  const reload = useProjectStore((s) => s.reloadProject)
  const saveOk = useUiStore((s) => s.saveOk)
  const runsError = useProjectStore((s) => s.runsError)
  const refreshRuns = useProjectStore((s) => s.refreshRuns)
  if (!SERVER_STORAGE) return null

  function loadServer(id) {
    useUiStore.getState().openConfirm({
      title: '서버 내용 불러오기', ok: '불러오기', danger: true,
      body: <p>이 탭의 미저장 편집 내용을 서버 내용으로 바꿉니다. 보관하려면 먼저 “편집본 다운로드”를 누르세요.</p>,
      onOk: async () => {
        try { await reload(id); useUiStore.getState().closeConfirm() }
        catch (error) { useUiStore.getState().showToast(error.message) }
      },
    })
  }

  return <>
    {runsError ? <div className="banner warn" role="alert"><span>실행 상태를 확인하지 못했습니다. {runsError}</span><button className="small" onClick={refreshRuns}>실행 기록 다시 불러오기</button></div> : null}
    {Object.entries(sync.projects).filter(([, item]) => ['error', 'conflict'].includes(item.status)).map(([id, item]) => {
      const project = projects.find((p) => p.id === id)
      if (!project) return null
      return <div className="banner bad" role="alert" key={id}>
        <span><b>{project.name}</b> · {item.message} 현재 편집 내용은 DB에 저장되지 않았습니다.</span>
        <div className="row">
          <button className="small" onClick={() => downloadDraft(project)}>편집본 다운로드</button>
          {item.status === 'conflict'
            ? <button className="small" onClick={() => loadServer(id)}>서버 내용 불러오기</button>
            : <button className="small" onClick={() => retry(id)}>저장 재시도</button>}
        </div>
      </div>
    })}
    {sync.storageError ? <div className="banner warn" role="alert">브라우저 임시 저장 공간을 사용할 수 없습니다. DB 저장 완료 전에는 이 탭을 닫지 마세요.</div> : null}
    {!saveOk ? <div className="banner warn" role="alert">시연 실행 결과를 브라우저에 저장하지 못했습니다. 프로젝트·설문·대상집단의 DB 저장 상태는 상단에서 확인하세요.</div> : null}
  </>
}
