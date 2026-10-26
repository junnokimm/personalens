import { useState } from 'react'
import PageHead from '../components/common/PageHead.jsx'
import { useSessionStore } from '../store/useSessionStore.js'
import { request } from '../lib/projectApi.js'
import { CONNECTION_STATUS, PROVIDER_NAMES, useConnectionStore } from '../store/useConnectionStore.js'

function ConnectionForm({ original, close }) {
  const user = useSessionStore((s) => s.user)
  const allowed = useConnectionStore((s) => s.dgxAllowedBaseUrls)
  const mockMode = useConnectionStore((s) => s.mockMode)
  const save = useConnectionStore((s) => s.save)
  const [provider, setProvider] = useState(original?.provider || 'openai')
  const [manual, setManual] = useState(original?.status === 'manual')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event) {
    event.preventDefault()
    const form = event.currentTarget, fields = new FormData(form)
    const key = fields.get('apiKey') || ''
    const body = { name: fields.get('name'), provider, scope: original?.scope || fields.get('scope') || 'private',
      baseUrl: provider === 'dgx' ? fields.get('baseUrl') : '', expectedRevision: original?.revision || 0,
      enabled: fields.get('enabled') === 'on',
      ...(key || !original ? { apiKey: key } : {}),
      ...(fields.get('clearKey') === 'on' ? { apiKey: '' } : {}),
      ...(manual && provider === 'dgx' ? { manualModelIds: String(fields.get('manualIds') || '').split(/\s+/).filter(Boolean) } : {}),
    }
    setBusy(true); setError('')
    try { await save(original?.id, body); form.reset(); close() }
    catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  return <section className="card"><h2>{original ? '연결 수정' : '새 연결 등록'}</h2>
    <form onSubmit={submit} className="connection-form">
      <div className="field"><label htmlFor="conn-name">연결 이름</label><input id="conn-name" name="name" defaultValue={original?.name} placeholder="예: 내 OpenAI, 연구실 DGX" required maxLength={100} /></div>
      <div className="field"><label htmlFor="conn-provider">공급자</label><select id="conn-provider" value={provider} disabled={!!original} onChange={(e) => { setProvider(e.target.value); setManual(false) }}>{Object.entries(PROVIDER_NAMES).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></div>
      <div className="field"><label htmlFor="conn-scope">사용 범위</label><select id="conn-scope" name="scope" defaultValue={original?.scope || 'private'} disabled={!!original}><option value="private">나만 사용</option>{user?.isAdmin && <option value="shared">연구실 공용 · 로그인한 팀원</option>}</select></div>
      {provider === 'dgx' && <div className="field"><label htmlFor="conn-url">DGX API 기본 주소</label><input id="conn-url" name="baseUrl" type="url" defaultValue={original?.baseUrl || allowed[0] || ''} placeholder="http://spark:8000/v1" required maxLength={1000} /><p className="muted small-text">허용된 서버: {allowed.length ? allowed.join(', ') : '아직 없습니다. 관리자에게 서버 주소 등록을 요청하세요.'}</p></div>}
      <div className="field"><label htmlFor="conn-key">API 키 {original?.hasKey ? '· 저장된 키 있음' : provider === 'dgx' ? '· 선택' : ''}</label>
        <input key={provider} id="conn-key" name="apiKey" type="password" autoComplete="off" spellCheck={false} maxLength={8192} required={!original?.hasKey && provider !== 'dgx'} placeholder={original?.hasKey ? '변경할 때만 새 키 입력' : mockMode ? 'fake-로 시작하는 검증용 키' : 'API 키 입력'} />
        <p className="muted small-text">키는 서버에 암호화해 저장하며 다시 표시하지 않습니다.</p>
        {provider === 'dgx' && original?.hasKey && <label className="check"><input name="clearKey" type="checkbox" />저장된 키 제거</label>}
      </div>
      {provider === 'dgx' && <div className="field"><label className="check"><input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} />모델 ID 직접 등록</label>
        {manual && <><label htmlFor="conn-models">모델 ID · 한 줄에 하나</label><textarea id="conn-models" name="manualIds" required defaultValue={original?.models.map((m) => m.id).join('\n')} placeholder="Qwen/model-id" /><p className="muted small-text">목록 API가 없는 서버용입니다. 입력한 모델의 실행 가능 여부는 아직 검증하지 않습니다.</p></>}
      </div>}
      <label className="check"><input name="enabled" type="checkbox" defaultChecked={original?.enabled ?? true} />이 연결 사용</label>
      {error && <p className="err-text" role="alert">{error}</p>}
      <div className="connection-actions"><button className="primary" disabled={busy}>{busy ? '저장 중…' : '연결 저장'}</button><button type="button" onClick={close} disabled={busy}>취소</button></div>
    </form>
  </section>
}

function AddMember() {
  const [status, setStatus] = useState(''), [busy, setBusy] = useState(false)
  async function submit(event) {
    event.preventDefault(); setBusy(true); setStatus('')
    const form = event.currentTarget
    try { await request('/auth/users', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) }); form.reset(); setStatus('팀원 계정이 등록되었습니다.') }
    catch (err) { setStatus(err.message) }
    finally { setBusy(false) }
  }
  return <details className="card"><summary>팀원 계정 등록 · 관리자</summary><form onSubmit={submit} className="connection-form">
    <div className="field"><label htmlFor="member-name">팀원 이름</label><input id="member-name" name="name" required maxLength={100} /></div>
    <div className="field"><label htmlFor="member-user">팀원 아이디</label><input id="member-user" name="username" required minLength={3} maxLength={80} autoComplete="off" /></div>
    <div className="field"><label htmlFor="member-password">팀원 비밀번호 · 10자 이상</label><input id="member-password" name="password" type="password" required minLength={10} maxLength={128} autoComplete="new-password" /></div>
    <button disabled={busy}>팀원 등록</button>{status && <p role="status">{status}</p>}
  </form></details>
}

export default function ConnectionsPage() {
  const { connections, mockMode, loading, error, load, check } = useConnectionStore()
  const user = useSessionStore((s) => s.user)
  const [editing, setEditing] = useState(null), [busy, setBusy] = useState(''), [message, setMessage] = useState('')
  async function verify(id) {
    setBusy(id); setMessage('')
    try { const row = await check(id); setMessage(row.status === 'ready' ? `${row.name}: ${row.models.length}개 모델 목록을 확인했습니다. 실제 응답 생성은 아직 연결하지 않았습니다.` : row.lastError) }
    catch (err) { setMessage(err.message) }
    finally { setBusy('') }
  }
  return <>
    <PageHead title="모델 연결" sub="개인 API 키 또는 연구실 모델 서버를 등록합니다. 프로젝트의 응답 모델 화면에서 연결과 모델을 선택하세요." />
    {mockMode && <p className="connection-notice" role="status">모의 서버 검증 모드 · OpenAI·Anthropic에는 fake-로 시작하는 가짜 키만 입력하세요.</p>}
    <div className="connection-actions"><button className="primary" onClick={() => setEditing({})} disabled={!!editing}>+ 연결 등록</button><button onClick={load} disabled={loading || !!busy}>{loading ? '불러오는 중…' : '목록 새로고침'}</button></div>
    {error && <p role="alert" className="err-text">{error}</p>}{message && <p role="status" className="connection-notice">{message}</p>}
    {editing && <ConnectionForm key={editing.id || 'new'} original={editing.id ? editing : null} close={() => setEditing(null)} />}
    {!loading && !connections.length && <section className="card"><h2>등록된 연결이 없습니다</h2><p className="muted">OpenAI, Anthropic 또는 DGX Spark 연결을 추가하세요.</p></section>}
    {connections.map((c) => <section className="card connection-row" key={c.id}>
      <div><h2>{c.name} <span className="tag">{PROVIDER_NAMES[c.provider]}</span></h2><p className="muted small-text">{c.scope === 'shared' ? '연구실 공용' : '나만 사용'} · {c.enabled ? CONNECTION_STATUS[c.status] : '사용 중지'} · {c.hasKey ? '키 저장됨' : '키 없음'} · 모델 {c.models.length}개</p>
        {c.provider === 'dgx' && <p className="small-text connection-url">{c.baseUrl}</p>}{c.lastError && <p className="err-text">{c.lastError}</p>}
      </div>
      {c.canEdit ? <div className="connection-actions"><button disabled={!!busy || !c.enabled || !!editing} onClick={() => verify(c.id)}>{busy === c.id ? '확인 중…' : '연결 확인 · 모델 조회'}</button><button disabled={!!busy || !!editing} onClick={() => setEditing(c)}>수정</button></div> : <span className="muted small-text">관리자가 관리하는 연결</span>}
    </section>)}
    {user?.isAdmin && <AddMember />}
  </>
}
