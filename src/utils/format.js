export const stamp = (s) => new Date(s).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
export const pct = (x) => x.toFixed(1) + '%'
