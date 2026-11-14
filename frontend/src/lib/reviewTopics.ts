import { SUBJECTS } from "./checklists";
import { quizSignal, SIGNAL_MIN_TOTAL } from "./topicSignal";
import type { ReviewInputs, ReviewTopic, SubjectReview } from "../types/domain";

const MAX_PER_SUBJECT = 3;
const FALLBACK_SUBJECT = "기타";

export function reviewTopicsBySubject(i: ReviewInputs): SubjectReview[] {
  const subjectOf = new Map(i.sessions.map((s) => [s.id, (SUBJECTS as readonly string[]).includes(s.subject) ? s.subject : FALLBACK_SUBJECT]));
  const nameOf = new Map(i.sessionTopics.map((t) => [t.topicId, t.name]));
  const understandingOf = new Map(i.reflections.map((r) => [r.sessionId, r.understanding]));
  // (과목, 주제)별 마지막 응시
  const last = new Map<string, { subject: string; a: ReviewInputs["attempts"][number] }>();
  for (const a of i.attempts) {
    const subject = subjectOf.get(a.sessionId);
    if (!subject || a.total === 0) continue;
    const key = `${subject}\u0000${a.topicId}`;
    const cur = last.get(key);
    if (!cur || a.createdAt > cur.a.createdAt) last.set(key, { subject, a });
  }
  const bySubject = new Map<string, ReviewTopic[]>();
  for (const { subject, a } of last.values()) {
    const rate = a.correct / a.total;
    const signal = quizSignal(rate, understandingOf.get(a.sessionId) ?? null, a.total);
    if (!signal) continue;
    const list = bySubject.get(subject) ?? [];
    list.push({ topicId: a.topicId, name: nameOf.get(a.topicId) ?? "", signal, lastRate: rate, lastAt: a.createdAt });
    bySubject.set(subject, list);
  }
  return SUBJECTS.filter((s) => bySubject.has(s)).map((subject) => ({ subject, topics: bySubject.get(subject)!.sort((x, y) => (x.lastAt < y.lastAt ? 1 : x.lastAt > y.lastAt ? -1 : 0)).slice(0, MAX_PER_SUBJECT) }));
}

export function sessionReviewLine(subject: string, topicName: string, correct: number, total: number): string | null {
  if (total < SIGNAL_MIN_TOTAL || correct / total >= 0.4) return null;
  return `${subject} - ${topicName}`;
}
