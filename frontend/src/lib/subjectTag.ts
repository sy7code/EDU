// 학습 시작 화면의 과목 태그(선택). 과목 목록은 lib/checklists.ts의 SUBJECTS 한 곳만 쓴다.
import { SUBJECTS } from "./checklists";
import type { SessionGoal } from "../types/domain";

/** "오늘 할 것" 글에 과목 이름(기타 제외)이 딱 하나 있으면 그 과목을 제안한다. 없거나 둘 이상이면 null */
export function suggestSubject(text: string): string | null {
  const hits = SUBJECTS.filter((s) => s !== "기타" && text.includes(s));
  return hits.length === 1 ? hits[0] : null;
}

/** 시작할 때 보낼 목표. 과목을 안 고르면 기타(담임만 봄), 자유 입력은 note에 둔다 */
export function buildGoal(plan: string, chosen: string | null, activities: string[]): SessionGoal {
  return { subject: chosen ?? "기타", activities: [...activities], note: plan.trim() };
}
