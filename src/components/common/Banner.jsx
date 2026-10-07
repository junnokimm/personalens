export default function Banner({ tone, children, actions }) {
  return (
    <div className={`banner ${tone}`}>
      <div>{children}</div>
      {actions ? <div className="row">{actions}</div> : null}
    </div>
  )
}
