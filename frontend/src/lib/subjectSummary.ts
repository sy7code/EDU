import { isInSeoulWeek } from "./schoolCalendar";
import { reviewTopicsBySubject } from "./reviewTopics";
import type { CountCell, SubjectSummaryInputs, SubjectWeekSummary } from "../types/domain";

const FEW_MAX = 2;
const NO_TOPIC = "주제 없음";
const NO_TOPIC_KEY = "\u0000none";
const MIN_STUDENTS_FOR_RATE = 3;
const HARD_QUESTION_LIMIT = 2;

type TopicRow = SubjectWeekSummary["topics"][number];

export function fewCell(n: number): CountCell {
  return n >= 1 && n <= FEW_MAX ? "적음" : n;
}

function add<K, V>(m: Map<K, Set<V>>, k: K, v: V) {
  const s = m.get(k) ?? new Set<V>();
  s.add(v);
  m.set(k, s);
}

export function subjectWeekSummary(classId: string, subject: string, weekStart: string, i: SubjectSummaryInputs): SubjectWeekSummary {
  const sessions = i.sessions.filter((s) => isInSeoulWeek(s.startedAt, weekStart));
  const weekIds = new Set(sessions.map((s) => s.id));
  const ownerOf = new Map(i.sessionOwners.map((o) => [o.sessionId, o.studentId]));
  const students = new Set(sessions.map((s) => ownerOf.get(s.id)).filter((x): x is string => !!x));
  const few = students.size >= 1 && students.size <= FEW_MAX;
  const base = { classId, subject, weekStart, few, sessionCount: sessions.length, studentCount: fewCell(students.size) };
  if (students.size === 0 || few) return { ...base, topics: [], hardQuestions: [] };

  const inWeek = <T extends { sessionId: string }>(rows: T[]) => rows.filter((r) => weekIds.has(r.sessionId));
  const sessionTopics = inWeek(i.sessionTopics);
  const attempts = inWeek(i.attempts);
  const names = new Map(sessionTopics.map((t) => [t.topicId, t.name]));

  // 주제별 학습 학생
  const studied = new Map<string, Set<string>>();
  const topicsOfSession = new Map<string, Set<string>>();
  for (const t of sessionTopics) add(topicsOfSession, t.sessionId, t.topicId);
  for (const s of sessions) {
    const owner = ownerOf.get(s.id);
    if (!owner) continue;
    const ts = topicsOfSession.get(s.id);
    if (!ts || ts.size === 0) add(studied, NO_TOPIC_KEY, owner);
    else for (const t of ts) add(studied, t, owner);
  }

  // 학생별 주 입력 -> 다시 볼 주제 후보
  const reviewBy = new Map<string, Set<string>>();
  for (const student of students) {
    const mine = new Set(sessions.filter((s) => ownerOf.get(s.id) === student).map((s) => s.id));
    const mineOf = <T extends { sessionId: string }>(rows: T[]) => rows.filter((r) => mine.has(r.sessionId));
    const review = reviewTopicsBySubject({
      sessions: sessions.filter((s) => mine.has(s.id)),
      sessionTopics: mineOf(sessionTopics),
      attempts: mineOf(attempts),
      reflections: mineOf(i.reflections),
    }).find((r) => r.subject === subject);
    for (const t of review?.topics ?? []) add(reviewBy, t.topicId, student);
  }

  // 학생별 주제 마지막 응시 정답률
  const lastBy = new Map<string, Map<string, { at: string; rate: number }>>();
  for (const a of attempts) {
    const owner = ownerOf.get(a.sessionId);
    if (!owner || a.total <= 0) continue;
    const m = lastBy.get(a.topicId) ?? new Map<string, { at: string; rate: number }>();
    const cur = m.get(owner);
    if (!cur || a.createdAt > cur.at) m.set(owner, { at: a.createdAt, rate: a.correct / a.total });
    lastBy.set(a.topicId, m);
  }

  const raw = [...studied].map(([key, who]) => {
    const topicId = key === NO_TOPIC_KEY ? null : key;
    const last = topicId === null ? undefined : lastBy.get(topicId);
    const lastRate = last && last.size >= MIN_STUDENTS_FOR_RATE ? [...last.values()].reduce((s, v) => s + v.rate, 0) / last.size : null;
    return { topicId, name: topicId === null ? NO_TOPIC : names.get(topicId) ?? "", studentN: who.size, reviewN: topicId === null ? 0 : reviewBy.get(topicId)?.size ?? 0, lastRate };
  });
  raw.sort((a, b) => b.reviewN - a.reviewN || b.studentN - a.studentN || a.name.localeCompare(b.name, "ko"));
  const topics: TopicRow[] = raw.map((r) => ({ topicId: r.topicId, name: r.name, studentCount: fewCell(r.studentN), reviewCount: fewCell(r.reviewN), lastRate: r.lastRate }));

  // 많이 틀린 문항
  const byQ = new Map<string, { prompt: string; n: number; correct: number; who: Set<string> }>();
  for (const it of inWeek(i.items)) {
    const owner = ownerOf.get(it.sessionId);
    if (it.reported || !owner) continue;
    const q = byQ.get(it.questionId) ?? { prompt: it.prompt, n: 0, correct: 0, who: new Set<string>() };
    q.n += 1;
    if (it.correct) q.correct += 1;
    q.who.add(owner);
    byQ.set(it.questionId, q);
  }
  const hardQuestions = [...byQ]
    .filter(([, q]) => q.who.size >= MIN_STUDENTS_FOR_RATE)
    .map(([questionId, q]) => ({ questionId, prompt: q.prompt, rate: q.correct / q.n, answered: q.who.size }))
    .sort((a, b) => a.rate - b.rate || (a.questionId < b.questionId ? -1 : a.questionId > b.questionId ? 1 : 0))
    .slice(0, HARD_QUESTION_LIMIT);

  return { ...base, topics, hardQuestions };
}
