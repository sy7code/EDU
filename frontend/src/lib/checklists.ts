// 체크리스트 항목. ID는 백엔드에 그대로 저장되므로 바꾸지 않는다 (추가만).

/** 과목 목록은 여기 한 곳만 쓴다(학습 시작 과목 태그, 교과 교사 열람, 서버 sessions.subject).
 *  실제 학교에서는 관리자 설정에서 학교의 과목 목록을 받아 올 예정이다. 기타는 항상 마지막에 둔다. */
export const SUBJECTS = ["국어", "수학", "영어", "사회", "과학", "기타"] as const;

export function isSubject(t: string): boolean {
  return (SUBJECTS as readonly string[]).includes(t);
}

export const GOAL_ACTIVITIES = [
  { id: "concept", label: "개념 이해하기" },
  { id: "problem", label: "문제 풀기" },
  { id: "review", label: "틀린 문제 다시 보기" },
  { id: "summary", label: "내용 정리하기" },
  { id: "reading", label: "읽기·자료 조사" },
  { id: "assignment", label: "과제 하기" },
] as const;

export const REFLECTION_ITEMS = [
  { id: "goal_done", label: "세운 목표를 끝까지 했다" },
  { id: "new_learned", label: "새로 알게 된 것이 있다" },
  { id: "own_words", label: "배운 것을 내 말로 설명할 수 있다" },
  { id: "asked", label: "모르는 것을 질문했다" },
  { id: "ai_checked", label: "AI 답을 그대로 믿지 않고 확인했다" },
  { id: "next_plan", label: "다음에 할 것을 정했다" },
] as const;

export const UNDERSTANDING_LABELS: Record<1 | 2 | 3, string> = {
  1: "아직 어려워요",
  2: "조금 이해했어요",
  3: "친구에게 설명할 수 있어요",
};

export function activityLabel(id: string): string {
  return GOAL_ACTIVITIES.find((a) => a.id === id)?.label ?? id;
}

export function reflectionLabel(id: string): string {
  return REFLECTION_ITEMS.find((r) => r.id === id)?.label ?? id;
}

type GoalLike = { subject: string; activities: string[]; note?: string };

/** 목표를 과목 태그와 "오늘 할 것"으로 나눈다.
 *  - 새 형식: subject는 SUBJECTS 중 하나, 오늘 할 것은 note. 기타는 태그로 보이지 않는다
 *  - 예전 형식(subject가 SUBJECTS 밖의 자유 입력): subject를 오늘 할 것으로 보고 태그는 없다 (note는 예전 메모라 제목에 쓰지 않는다) */
export function goalParts(goal: GoalLike): { tag: string | null; text: string } {
  const note = goal.note?.trim() ?? "";
  if (!isSubject(goal.subject) || !note) return { tag: null, text: goal.subject };
  return { tag: goal.subject === "기타" ? null : goal.subject, text: note };
}

/** 목표 한 줄 표시: "과목 · 오늘 할 것 · 활동". 없는 칸은 빼서 " · "가 남지 않게 한다 */
export function goalLabel(goal: GoalLike): string {
  const { tag, text } = goalParts(goal);
  const acts = goal.activities.map(activityLabel).join(", ");
  return [tag, text, acts].filter(Boolean).join(" · ");
}
