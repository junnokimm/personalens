export const stamp = (s) => new Date(s).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
export const pct = (x) => x.toFixed(1) + '%'

/* 숫자 n 뒤에 붙는 조사 고르기. pair는 [받침 있음, 받침 없음] 순서(예: ['이','가'], ['을','를'], ['과','와'], ['은','는']).
 * 일의 자리가 0이 아니면 그 숫자를 읽는 소리의 받침 여부로(2·4·5·9는 받침 없음),
 * 일의 자리가 0이면 "십·백·천·만·영"처럼 받침 있음으로 본다. */
export function josa(n, [withBatchim, withoutBatchim]) {
  const last = Math.abs(n) % 10
  const hasBatchim = last === 0 ? true : ![2, 4, 5, 9].includes(last)
  return hasBatchim ? withBatchim : withoutBatchim
}
