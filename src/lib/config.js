/* 회의에서 확정 전까지 쓰는 임시 기준값. 한 곳에서만 바꾸면 전체에 반영됩니다. */
export const CONFIG = {
  MIN_GROUP: 30,      // 이 인원 미만인 집단은 표본 경고
  MIN_CELL: 5,        // 비교 구간 최소 인원 (미만이면 흐리게 + 순위 제외)
  HIGHLIGHT_PP: 10,   // 차이 강조 기준 (%p)
  MIN_PERSONAS: 10,
  MAX_PERSONAS: 500,
}
