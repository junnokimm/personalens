import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import { useUiStore } from '../../store/useUiStore.js'

/* 원본 toast(): 동작 버튼이 있으면 7000ms, 없으면 3500ms 뒤 사라짐 */
export default function Toast() {
  const toast = useUiStore((s) => s.toast)
  const hideToast = useUiStore((s) => s.hideToast)
  const navigate = useNavigate()

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(hideToast, toast.actionLabel ? 7000 : 3500)
    return () => clearTimeout(timer)
  }, [toast, hideToast])

  function handleAction() {
    hideToast()
    if (toast.action?.onClick) toast.action.onClick()
    else if (toast.action?.to) navigate(toast.action.to)
  }

  return (
    <div id="toast" role="status" hidden={!toast}>
      {toast ? <span>{toast.text}</span> : null}
      {toast?.actionLabel ? <button className="small" onClick={handleAction}>{toast.actionLabel}</button> : null}
    </div>
  )
}
