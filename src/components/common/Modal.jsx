import { useEffect } from 'react'

/* 원본 #overlay: backdrop + section.modal. Escape로 닫는 동작은 열려 있는 동안만 듣는다 */
export default function Modal({ onClose, className = '', labelledBy, children }) {
  useEffect(() => {
    function onKeyDown(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <section className={`modal ${className}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        {children}
      </section>
    </>
  )
}
