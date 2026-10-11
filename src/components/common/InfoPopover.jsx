import { useEffect, useRef, useState } from 'react'

/* 작은 "ⓘ" 표시 — 누르거나(모바일) 마우스를 올리거나 키보드로 포커스하면 문장을 팝오버로 보여준다.
 * 노란 배너 대신 흰 바탕 + 옅은 테두리 + 그림자로 차분하게. Escape나 바깥 클릭으로 닫힌다. */
export default function InfoPopover({ label, children }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e) { if (!ref.current?.contains(e.target)) setOpen(false) }
    function onKeyDown(e) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <span className="info-pop" ref={ref}>
      <button
        type="button"
        className="info-pop-trigger"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {label} <span aria-hidden="true">ⓘ</span>
      </button>
      {open ? <span role="tooltip" className="info-pop-bubble">{children}</span> : null}
    </span>
  )
}
