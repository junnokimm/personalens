import { useEffect, useRef } from 'react'

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

/* 원본 #overlay: backdrop + section.modal. Escape로 닫는 동작은 열려 있는 동안만 듣는다.
 * 추가로: 열리면 initialFocus(아이디)가 가리키는 요소, 없으면 모달 안 첫 포커스 가능 요소로 포커스하고,
 * Tab/Shift+Tab은 모달 안에서만 돌며, 닫히면(언마운트되면) 이 모달을 연 요소로 포커스가 돌아간다. */
export default function Modal({ onClose, className = '', labelledBy, initialFocus, children }) {
  const ref = useRef(null)
  /* react-dom/server(renderToStaticMarkup)로 렌더링할 때는 document가 없다 */
  const openerRef = useRef(typeof document === 'undefined' ? null : document.activeElement)

  useEffect(() => {
    const el = ref.current
    const opener = openerRef.current
    const focusables = () => [...el.querySelectorAll(FOCUSABLE)].filter((x) => !x.disabled && x.offsetParent !== null)

    const target = (initialFocus && el.querySelector(`#${CSS.escape(initialFocus)}`)) || focusables()[0]
    target?.focus()

    function onKeyDown(e) {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab') return
      const items = focusables()
      if (!items.length) return
      const first = items[0], last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      opener?.focus?.()
    }
  }, [onClose, initialFocus])

  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <section ref={ref} className={`modal ${className}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        {children}
      </section>
    </>
  )
}
