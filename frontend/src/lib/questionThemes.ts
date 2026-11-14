import type { QuestionTheme } from "../types/domain";

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

// mock 전용 낱말 규칙: 실제 AI를 흉내 내는 작은 표. 질문은 맞는 첫 규칙에 넣고, 묶음은 규칙 순서로 나온다.
const MOCK_RULES: Array<{ title: string; match: (t: string) => boolean }> = [
  { title: "꼭짓점을 구하는 순서가 헷갈려요", match: (t) => !t.includes("판별식") && t.includes("꼭짓점") && ["순서", "구하", "어떻게"].some((w) => t.includes(w)) },
  { title: "판별식과 꼭짓점의 관계가 궁금해요", match: (t) => t.includes("판별식") },
  { title: "부등호 방향이 바뀌는 때가 헷갈려요", match: (t) => ["부등호", "방향"].some((w) => t.includes(w)) },
];

/**
 * mock AI: 질문 글의 낱말로 묶는다. 어느 규칙에도 안 맞는 질문은 묶지 않는다(기타 묶음 없음).
 * topicName은 묶음 질문이 모두 같은 세션 주제일 때만 쓴다.
 */
export function mockThemeGroups(questions: Array<{ id: string; text: string; topicName: string | null }>): RawTheme[] {
  const out: RawTheme[] = [];
  for (const rule of MOCK_RULES) {
    const qs = questions.filter((q) => MOCK_RULES.find((r) => r.match(q.text)) === rule);
    if (qs.length === 0) continue;
    const names = new Set(qs.map((q) => q.topicName));
    const only = names.size === 1 ? [...names][0] : null;
    out.push({ title: rule.title, questionIds: qs.map((q) => q.id), topicName: only });
  }
  return out;
}
