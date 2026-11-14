import type { TopicGrowth } from "../types/domain";

export const SIGNAL_MIN_TOTAL = 3; // 채점 문항이 이보다 적으면 차이 신호를 내지 않음

/** 차이 신호: 스스로 '설명할 수 있다(3)'인데 60% 미만 → OVERCONFIDENT, 그 외 40% 미만 → LOW_SCORE */
export function quizSignal(rate: number | null, understanding: number | null, total = SIGNAL_MIN_TOTAL): TopicGrowth["signal"] {
  if (rate === null || total < SIGNAL_MIN_TOTAL) return null; // 신고로 채점 문항이 너무 적으면 판단하지 않음
  if (understanding === 3 && rate < 0.6) return "OVERCONFIDENT";
  if (rate < 0.4) return "LOW_SCORE";
  return null;
}
