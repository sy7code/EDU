import type { LearningEntry, LearningSession, Reflection } from "../types/domain";
import { goalLabel, reflectionLabel, UNDERSTANDING_LABELS } from "./checklists";

export type NotebookSession = {
  session: LearningSession;
  entries: LearningEntry[];
  reflection: Reflection | null;
};
export type OpenQuestion = { sessionId: string; startedAt: string; text: string };
export type Notebook = { sessions: NotebookSession[]; openQuestions: OpenQuestion[] };

/** 돌아보기에서 검색 대상 글자 (체크 항목은 화면에 보이는 문구로) */
function reflectionText(r: Reflection | null): string {
  if (!r) return "";
  return [
    ...r.checks.map(reflectionLabel),
    r.understanding ? UNDERSTANDING_LABELS[r.understanding] : "",
    r.note ?? "",
    r.legacyText ?? "",
    ...r.remainingQuestions,
  ].join("\n");
}

/** 학생 '내 정리': 세션별로 내가 쓴 기록·돌아보기를 묶어 최근 순. 검색어가 있으면 글자가 맞는 세션·항목만 */
export function buildNotebook(
  sessions: LearningSession[],
  entries: LearningEntry[],
  reflections: Reflection[],
  query = "",
): Notebook {
  const q = query.trim().toLowerCase();
  const has = (text: string) => !q || text.toLowerCase().includes(q);
  const reflOf = new Map(reflections.map((r) => [r.sessionId, r]));
  const entriesOf = new Map<string, LearningEntry[]>();
  for (const e of entries) entriesOf.set(e.sessionId, [...(entriesOf.get(e.sessionId) ?? []), e]);

  const newest = [...sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const out: NotebookSession[] = [];
  for (const session of newest) {
    const reflection = reflOf.get(session.id) ?? null;
    const all = [...(entriesOf.get(session.id) ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (all.length === 0 && !reflection) continue;
    // 목표·돌아보기 글자가 맞으면 세션 전체를, 아니면 맞는 기록만 남긴다
    const headerHit = has(goalLabel(session.goal)) || (reflection !== null && has(reflectionText(reflection)));
    const shown = headerHit ? all : all.filter((e) => has(e.content));
    if (!headerHit && shown.length === 0) continue;
    out.push({ session, entries: shown, reflection });
  }

  const openQuestions = newest.flatMap((s) =>
    (reflOf.get(s.id)?.remainingQuestions ?? [])
      .map((t) => t.trim())
      .filter((t) => t && has(t))
      .map((text) => ({ sessionId: s.id, startedAt: s.startedAt, text })),
  );
  return { sessions: out, openQuestions };
}
