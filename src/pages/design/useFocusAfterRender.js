import { useEffect, useRef } from 'react'

/* 상태가 바뀌어 다시 그려진 뒤 특정 엘리먼트에 포커스하거나 스크롤한다.
 * 원본이 render() 호출 뒤 $('#...').focus()/scrollIntoView()를 부르던 자리에 대응한다. */
export function useFocusAfterRender() {
  const pending = useRef(null)
  useEffect(() => {
    if (!pending.current) return
    const { id, action } = pending.current
    pending.current = null
    const el = document.getElementById(id)
    if (!el) return
    if (action === 'scroll') el.scrollIntoView({ block: 'center' })
    else if (action === 'select') el.select()
    else el.focus()
  })
  return (id, action = 'focus') => { pending.current = { id, action } }
}
