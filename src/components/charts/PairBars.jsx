/* 원본 comparison.js의 pairBars() — A/B 또는 "이 집단"/"비교 기준" 막대 쌍.
 * 집단 나누기 표는 비교 쪽 막대에 "pbase" 클래스를 쓰고, 선택지 비교는 "pb"를 쓴다(원본 그대로). */
export default function PairBars({ aPercent, bPercent, bClassName = 'pb' }) {
  return (
    <>
      <div className="pair"><i className="pa" style={{ width: `${aPercent}%` }} /></div>
      <div className="pair"><i className={bClassName} style={{ width: `${bPercent}%` }} /></div>
    </>
  )
}
