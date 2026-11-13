// 체크리스트 항목. ID는 백엔드에 그대로 저장되므로 바꾸지 않는다 (추가만).

export const SUBJECTS = ["국어", "수학", "영어", "사회", "과학", "기타"] as const;

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
