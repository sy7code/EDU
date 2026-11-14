import type { QuestionTheme } from "../types/domain";
import { classifyQuestion, QUESTION_TYPE_LABEL, type QuestionType } from "./questionType";

export const THEME_MIN_STUDENTS = 3;
export const THEME_MAX = 5;
export const THEME_TITLE_MAX = 60;

export type RawTheme = { title: string; questionIds: string[]; topicName?: string | null };

/**
 * 묶음 결과를 정리한다. 학생 수는 AI 숫자가 아니라 questionIds의 서로 다른 학생으로 센다.
 * 3명 미만은 버리고 hiddenCount에 센다(개인이 드러나지 않게). 상위 5개만 남긴다.
 */
export function finalizeThemes(raw: RawTheme[], ownerOf: Record<string, string>): { themes: QuestionTheme[]; hiddenCount: number } {
  let hiddenCount = 0;
  const kept: QuestionTheme[] = [];
  for (const r of raw) {
    const owners = new Set<string>();
    for (const id of r.questionIds) {
      const o = ownerOf[id];
      if (o) owners.add(o);
    }
    if (owners.size < THEME_MIN_STUDENTS) {
      hiddenCount++;
      continue;
    }
    kept.push({ title: r.title.slice(0, THEME_TITLE_MAX), studentCount: owners.size, topicName: r.topicName ?? null });
  }
  kept.sort((a, b) => b.studentCount - a.studentCount || (a.title < b.title ? -1 : a.title > b.title ? 1 : 0));
  return { themes: kept.slice(0, THEME_MAX), hiddenCount };
}

const OTHER_TOPIC = "기타 질문";
const TITLE_BY_TYPE: Record<QuestionType, string> = {
  CONCEPT: "의 개념과 이유를 궁금해해요",
  CHECK: " 풀이가 맞는지 확인하고 싶어 해요",
  ANSWER: "의 답이나 풀이를 바로 알고 싶어 해요",
  OTHER: "에 대해 여러 질문이 있어요",
};

/** mock AI: 질문이 달린 세션의 주제로 묶고(없으면 "기타 질문"), 가장 많은 질문 유형으로 제목 문장을 만든다 */
export function mockThemeGroups(questions: Array<{ id: string; text: string; topicName: string | null }>): RawTheme[] {
  const groups = new Map<string, Array<{ id: string; text: string }>>();
  for (const q of questions) {
    const key = q.topicName ?? OTHER_TOPIC;
    groups.set(key, [...(groups.get(key) ?? []), q]);
  }
  const out: RawTheme[] = [];
  for (const [name, qs] of groups) {
    const counts = new Map<QuestionType, number>();
    for (const q of qs) {
      const t = classifyQuestion(q.text);
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    // 동률이면 유형 순서(개념→확인→답 요청→기타)로
    const order: QuestionType[] = ["CONCEPT", "CHECK", "ANSWER", "OTHER"];
    const dominant = order.reduce((best, t) => ((counts.get(t) ?? 0) > (counts.get(best) ?? 0) ? t : best), order[0]);
    const label = name === OTHER_TOPIC ? "주제가 정해지지 않은 질문" : name;
    out.push({ title: `${label}${TITLE_BY_TYPE[dominant]} (${QUESTION_TYPE_LABEL[dominant]} 중심)`, questionIds: qs.map((q) => q.id), topicName: name === OTHER_TOPIC ? null : name });
  }
  return out;
}
