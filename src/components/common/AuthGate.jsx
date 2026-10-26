import { useEffect, useState } from 'react'
import { request, setSessionIdentity } from '../../lib/projectApi.js'
import { initializeSession, SERVER_STORAGE } from '../../store/useProjectStore.js'

import { useSessionStore } from '../../store/useSessionStore.js'

export default function AuthGate({ children }) {
  const [state, setState] = useState({ loading: SERVER_STORAGE, user: null, needsSetup: false })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [expired, setExpired] = useState(false)
  useEffect(() => {
    if (!SERVER_STORAGE) return
    let active = true
    request('/auth/session').then((data) => {
      if (!active) return
      if (data.user) {
        setSessionIdentity(data.user.id)
        initializeSession(data.user.id)
        useSessionStore.setState({ user: data.user })
      }
      setState({ ...data, loading: false })
    }).catch((err) => { if (active) { setError(err.message); setState({ loading: false }) } })
    const onExpired = () => setExpired(true)
    window.addEventListener('persona-session-expired', onExpired)
    return () => { active = false; window.removeEventListener('persona-session-expired', onExpired) }
  }, [])
  if (!SERVER_STORAGE || (state.user && !expired)) return children
  async function submit(event) {
    event.preventDefault()
    const form = event.currentTarget
    const data = Object.fromEntries(new FormData(form))
    setBusy(true); setError('')
    try {
      await request(`/auth/${state.needsSetup ? 'setup' : 'login'}`, { method: 'POST', body: JSON.stringify(data) })
      form.reset()
      window.location.reload()
    } catch (err) { setError(err.message); setBusy(false) }
  }
  return <div className="auth-shell"><section className="card auth-card">
    <div className="brand"><span className="logo" aria-hidden="true">P</span>PersonaLens</div>
    {state.loading ? <p role="status">로그인 상태를 확인하는 중입니다…</p>
      : expired ? <><h1>로그인 상태가 변경되었습니다</h1><p>초안은 이 계정의 탭에 보관됩니다. 새로고침한 뒤 다시 로그인하세요.</p><button className="primary" onClick={() => window.location.reload()}>새로고침</button></>
        : <><h1>{state.needsSetup ? '첫 관리자 계정 만들기' : '로그인'}</h1>
          <p className="muted">{state.needsSetup ? '기존 프로젝트와 실행 기록은 이 계정으로 이어집니다.' : '내 프로젝트와 모델 연결을 불러옵니다.'}</p>
          <form onSubmit={submit}>
            {state.needsSetup && <div className="field"><label htmlFor="auth-name">이름</label><input id="auth-name" name="name" required maxLength={100} autoComplete="name" /></div>}
            <div className="field"><label htmlFor="auth-user">아이디</label><input id="auth-user" name="username" required minLength={3} maxLength={80} pattern="[a-zA-Z0-9_.@\-]+" autoComplete="username" /></div>
            <div className="field"><label htmlFor="auth-password">비밀번호</label><input id="auth-password" name="password" type="password" required minLength={10} maxLength={128} autoComplete={state.needsSetup ? 'new-password' : 'current-password'} /></div>
            <button className="primary" disabled={busy}>{busy ? '확인 중…' : state.needsSetup ? '관리자 계정 만들기' : '로그인'}</button>
          </form>
        </>}
    {error && <p className="err-text" role="alert">{error} <button onClick={() => window.location.reload()}>다시 불러오기</button></p>}
  </section></div>
}
