import { useEffect } from 'react'

import { useUiStore } from '../../store/useUiStore.js'
import Modal from './Modal.jsx'

/* 원본 confirmModal(): 열리면 기본으로 확인 버튼에 포커스하지만, 입력칸이 있는 모달(새 프로젝트 등)은
   그 입력칸에 포커스하도록 confirm.initialFocus로 지정할 수 있다 */
export default function ConfirmModal() {
  const confirm = useUiStore((s) => s.confirm)
  const closeConfirm = useUiStore((s) => s.closeConfirm)

  useEffect(() => {
    if (!confirm) return
    document.getElementById(confirm.initialFocus || 'cm-ok')?.focus()
  }, [confirm])

  if (!confirm) return null
  const { title, body, ok = '확인', danger = false, onOk } = confirm

  return (
    <Modal className="small-modal" onClose={closeConfirm} labelledBy="cm-title">
      <h2 id="cm-title">{title}</h2>
      <div className="cm-body">{body}</div>
      <div className="row end">
        <button onClick={closeConfirm}>취소</button>
        <button className={danger ? 'danger' : 'primary'} id="cm-ok" onClick={() => onOk?.()}>{ok}</button>
      </div>
    </Modal>
  )
}
