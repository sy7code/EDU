// 교사 반 분석 집계. 순수 함수만 둔다.
import type { ClassAnalyticsRaw } from "../types/domain";
import { classifyQuestion, type QuestionType } from "./questionType";

export type Distribution = { mean: number | null; median: number | null; buckets: Array<{ label: string; count: number }> };
export type StudentStat = {
  studentId: string;
  name: string;
  number: number;
  shared: boolean;
  sessionCount: number;
  minutes: number;
  questionCount: number | null;
  quizRate: number | null;
  types: Record<QuestionType, number> | null;
  mainType: QuestionType | null;
};
export type ClassAnalytics = {
  students: StudentStat[];
  excludedCount: number;
  minutes: Distribution;
  quizRate: Distribution;
  questions: Distribution;
  types: Record<QuestionType, number>;
  topTopics: Array<{ topicId: string; name: string; studentCount: number; avgRate: number | null }>;
};

const MINUTE_BUCKETS: Array<[string, (v: number) => boolean]> = [
  ["0", (v) => v === 0],
  ["1~59분", (v) => v > 0 && v < 60],
  ["1~3시간", (v) => v >= 60 && v < 180],
  ["3~5시간", (v) => v >= 180 && v < 300],
  ["5시간+", (v) => v >= 300],
];
const RATE_BUCKETS: Array<[string, (v: number) => boolean]> = [
  ["0~19%", (v) => v < 0.2],
  ["20~39%", (v) => v >= 0.2 && v < 0.4],
  ["40~59%", (v) => v >= 0.4 && v < 0.6],
  ["60~79%", (v) => v >= 0.6 && v < 0.8],
  ["80~100%", (v) => v >= 0.8],
];
const QUESTION_BUCKETS: Array<[string, (v: number) => boolean]> = [
  ["0", (v) => v === 0],
  ["1~3", (v) => v >= 1 && v <= 3],
  ["4~7", (v) => v >= 4 && v <= 7],
  ["8~12", (v) => v >= 8 && v <= 12],
  ["13+", (v) => v >= 13],
];
// 동률이면 앞의 유형을 주 유형으로 (답 요청이 가장 눈여겨볼 신호)
const TYPE_ORDER: QuestionType[] = ["ANSWER", "CHECK", "CONCEPT", "OTHER"];

function zeroTypes(): Record<QuestionType, number> {
  return { CONCEPT: 0, CHECK: 0, ANSWER: 0, OTHER: 0 };
}

function distribution(values: Array<number | null>, buckets: Array<[string, (v: number) => boolean]>): Distribution {
  const vs = values.filter((v): v is number => v !== null && Number.isFinite(v));
  const sorted = [...vs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length === 0 ? null : sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return {
    mean: vs.length === 0 ? null : vs.reduce((n, v) => n + v, 0) / vs.length,
    median,
    buckets: buckets.map(([label, test]) => ({ label, count: vs.filter(test).length })),
  };
}

function rate(attempts: Array<{ correct: number; total: number }>): number | null {
  const scored = attempts.filter((a) => a.total > 0);
  const total = scored.reduce((n, a) => n + a.total, 0);
  return total === 0 ? null : scored.reduce((n, a) => n + a.correct, 0) / total;
}

export function summarizeClass(raw: ClassAnalyticsRaw): ClassAnalytics {
  const shared = new Set(raw.students.filter((s) => s.shared).map((s) => s.studentId));
  const sessionOwner = new Map(raw.sessions.map((s) => [s.id, s.studentId]));
  const classTypes = zeroTypes();

  const students: StudentStat[] = [...raw.students]
    .sort((a, b) => a.number - b.number)
    .map((st) => {
      const own = raw.sessions.filter((s) => s.studentId === st.studentId);
      const base = {
        ...st,
        sessionCount: own.length,
        minutes: own.reduce((n, s) => n + (s.durationMinutes ?? 0), 0),
      };
      if (!st.shared) return { ...base, questionCount: null, quizRate: null, types: null, mainType: null };
      const types = zeroTypes();
      const qs = raw.questions.filter((q) => q.studentId === st.studentId);
      for (const q of qs) {
        const t = classifyQuestion(q.content);
        types[t] += 1;
        classTypes[t] += 1;
      }
      const mainType = qs.length === 0 ? null : TYPE_ORDER.reduce((best, t) => (types[t] > types[best] ? t : best), TYPE_ORDER[0]);
      return {
        ...base,
        questionCount: qs.length,
        quizRate: rate(raw.attempts.filter((a) => a.studentId === st.studentId)),
        types,
        mainType,
      };
    });

  const topics = new Map<string, { name: string; studentIds: Set<string> }>();
  for (const t of raw.sessionTopics) {
    const owner = sessionOwner.get(t.sessionId);
    if (!owner || !shared.has(owner)) continue;
    const cur = topics.get(t.topicId) ?? { name: t.name, studentIds: new Set<string>() };
    cur.studentIds.add(owner);
    topics.set(t.topicId, cur);
  }
  const topTopics = [...topics.entries()]
    .map(([topicId, v]) => ({
      topicId,
      name: v.name,
      studentCount: v.studentIds.size,
      avgRate: rate(raw.attempts.filter((a) => a.topicId === topicId && shared.has(a.studentId))),
    }))
    .sort((a, b) => b.studentCount - a.studentCount || a.name.localeCompare(b.name, "ko"))
    .slice(0, 5);

  const sharedStats = students.filter((s) => s.shared);
  return {
    students,
    excludedCount: students.length - sharedStats.length,
    minutes: distribution(students.map((s) => s.minutes), MINUTE_BUCKETS),
    quizRate: distribution(sharedStats.map((s) => s.quizRate), RATE_BUCKETS),
    questions: distribution(sharedStats.map((s) => s.questionCount), QUESTION_BUCKETS),
    types: classTypes,
    topTopics,
  };
}
