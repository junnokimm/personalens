/* 메뉴와 경로는 있지만 기능이 아직 없는 화면 */
export default function ComingSoon({ what, children }) {
  return (
    <section className="card coming-soon">
      <span className="tag">준비 중</span>
      <p className="big">{what}은 준비 중입니다.</p>
      {children ? <div className="muted small-text">{children}</div> : null}
    </section>
  )
}
