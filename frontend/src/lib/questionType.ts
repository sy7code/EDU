// AI 도우미에 보낸 학생 질문을 규칙으로 나눈다. 자동 분류라 참고용으로만 표시한다.
export type QuestionType = "CONCEPT" | "CHECK" | "ANSWER" | "OTHER";

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  CONCEPT: "개념 이해",
  CHECK: "풀이 확인",
  ANSWER: "답 요청",
  OTHER: "기타",
};

// 앞에 있는 유형이 우선 (답 요청 > 풀이 확인 > 개념 이해)
const RULES: Array<[QuestionType, string[]]> = [
  ["ANSWER", ["답 알려", "답알려", "정답이 뭐", "정답 뭐", "정답 알려", "정답 좀", "답이 뭐", "답 뭐", "답만", "답 줘", "풀이 보여", "풀이 알려", "그냥 알려", "다 풀어"]],
  ["CHECK", ["맞아", "맞나", "맞지", "맞는지", "맞게", "확인해", "확인 해", "틀렸", "틀린", "나왔는데", "풀었는데"]],
  ["CONCEPT", ["왜", "어떻게", "뭐야", "무엇", "뜻", "의미", "차이", "이유", "원리", "언제"]],
];

export function classifyQuestion(text: string): QuestionType {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "OTHER";
  for (const [type, words] of RULES) if (words.some((w) => t.includes(w))) return type;
  return "OTHER";
}
