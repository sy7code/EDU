import type { DashboardRow } from "../types/domain";

export type DashboardFilter = "all" | "attention" | "feedback" | "active" | "pending";

/** 대시보드 상태 카드로 고른 조건에 학생 행이 맞는지 */
export function matchesFilter(r: DashboardRow, filter: DashboardFilter): boolean {
  switch (filter) {
    case "attention":
      return r.needsAttention;
    case "feedback":
      return r.hasReflectionWithoutFeedback;
    case "active":
      return r.activeNow;
    case "pending":
      return r.pendingAssessment > 0;
    default:
      return true;
  }
}
