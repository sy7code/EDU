// Pace 지수: 하루 100점 (지속성 25 / 과정 기록 25 / 성찰 20 / 목표 달성 30)
// 기준은 학생 자기 평소(그날 이전 28일). 안 A: 교사 공개 기록 + 종이 기록만 센다.
import type { LearningEntry, LearningSession, Reflection } from "../types/domain";
import { minutesBetween } from "./time";

export type PaceAttempt = { sessionId: string; correct: number; total: number; createdAt: string };
export type PaceInputs = {
  sessions: LearningSession[];
  entries: LearningEntry[];
  reflections: Reflection[];
  attempts: PaceAttempt[];
};
export type PaceParts = { persistence: number; process: number; reflection: number; goal: number };
export type DailyPace = { date: string; total: number; parts: PaceParts };

const KST = 9 * 3600000;
const DAY = 86400000;

/** 서울 날짜 YYYY-MM-DD */
export function seoulDateKey(iso: string): string {
  return new Date(Date.parse(iso) + KST).toISOString().slice(0, 10);
}

function sessionMinutes(s: LearningSession, now: Date): number {
  if (s.durationMinutes != null) return s.durationMinutes;
  return minutesBetween(s.startedAt, s.endedAt ?? now.toISOString());
}

function median(xs: number[]): number {
  const a = [...xs].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

/** 날짜별 세션 묶음 */
function byDate(sessions: LearningSession[]): Map<string, LearningSession[]> {
  const map = new Map<string, LearningSession[]>();
  for (const s of sessions) {
    const k = seoulDateKey(s.startedAt);
    map.set(k, [...(map.get(k) ?? []), s]);
  }
  return map;
}

/** date 이전 28일(date 제외)의 학습일 */
function priorDays(days: Map<string, LearningSession[]>, date: string): LearningSession[][] {
  const end = Date.parse(`${date}T00:00:00Z`);
  const start = end - 28 * DAY;
  return [...days.entries()]
    .filter(([k]) => {
      const t = Date.parse(`${k}T00:00:00Z`);
      return t >= start && t < end;
    })
    .map(([, list]) => list);
}

/** 의미 있는 기록: 교사 공개인 10자 이상 메모·궁금한 점, 또는 교사 공개 종이 기록. '나만 보기'는 종류와 관계없이 세지 않음 */
export function isMeaningfulEntry(e: LearningEntry): boolean {
  if (e.visibility !== "TEACHER") return false;
  if (e.kind === "PAPER") return true;
  if (e.kind !== "MEMO" && e.kind !== "QUESTION") return false;
  return e.content.trim().length >= 10;
}

function reflectionScore(r: Reflection): number {
  const hasText = r.remainingQuestions.some((q) => q.trim() !== "") || (r.note ?? "").trim() !== "";
  return 6 + (r.checks.length >= 2 ? 6 : 0) + (hasText ? 8 : 0);
}

/** 내보낼 기록: 교사 공개 기록만. '나만 보기'는 내용도 개수도 교사에게 드러나지 않게 아예 뺀다 (사용자 결정 안 A) */
export function paceVisibleEntries(entries: LearningEntry[]): LearningEntry[] {
  return entries.filter((e) => e.visibility === "TEACHER").map((e) => ({ ...e }));
}

export function computeDailyPace(inputs: PaceInputs, date: string, now: Date = new Date()): DailyPace | null {
  const days = byDate(inputs.sessions);
  const day = days.get(date) ?? [];
  if (day.length === 0) return null;
  const minutesOf = (list: LearningSession[]) => list.reduce((sum, s) => sum + sessionMinutes(s, now), 0);
  const minutes = minutesOf(day);
  const prior = priorDays(days, date);
  const baselineMinutes = prior.length >= 3 ? median(prior.map(minutesOf)) || 30 : 30;
  const persistence = Math.round(Math.min(25, (minutes / baselineMinutes) * 25));
  const entriesOf = (list: LearningSession[]) => {
    const ids = new Set(list.map((x) => x.id));
    return inputs.entries.filter((e) => ids.has(e.sessionId) && isMeaningfulEntry(e)).length;
  };
  const baselineEntries = prior.length >= 3 ? Math.max(2, prior.map(entriesOf).reduce((a, b) => a + b, 0) / prior.length) : 2;
  const process = Math.round(Math.min(25, (entriesOf(day) / baselineEntries) * 25));
  const dayIds = new Set(day.map((x) => x.id));
  const dayReflections = inputs.reflections.filter((r) => dayIds.has(r.sessionId));
  const reflection = Math.max(0, ...dayReflections.map(reflectionScore));
  const goalDone = dayReflections.some((r) => r.checks.includes("goal_done"));
  const quizzes = inputs.attempts.filter((a) => dayIds.has(a.sessionId) && a.total > 0);
  const goal =
    quizzes.length === 0
      ? goalDone ? 30 : 0
      : (goalDone ? 15 : 0) + Math.round((quizzes.reduce((sum, a) => sum + a.correct / a.total, 0) / quizzes.length) * 15);
  const parts: PaceParts = { persistence, process, reflection, goal };
  return { date, total: parts.persistence + parts.process + parts.reflection + parts.goal, parts };
}

export type PaceDay = { date: string; label: string; pace: DailyPace | null };
export type PaceTrend = { tone: "up" | "flat" | "down"; label: string; diff: number };

/** 이번 서울 주의 월~금 날짜 (토·일이면 그 주 월~금) */
export function weekDates(now: Date): string[] {
  const today = Date.parse(`${seoulDateKey(now.toISOString())}T00:00:00Z`);
  const dow = new Date(today).getUTCDay(); // 0 일 ~ 6 토
  const monday = today - ((dow + 6) % 7) * DAY;
  return [0, 1, 2, 3, 4].map((i) => new Date(monday + i * DAY).toISOString().slice(0, 10));
}

const DAY_LABELS = ["월", "화", "수", "목", "금"];

export function weekSeries(inputs: PaceInputs, now: Date = new Date()): PaceDay[] {
  return weekDates(now).map((date, i) => ({ date, label: DAY_LABELS[i], pace: computeDailyPace(inputs, date, now) }));
}

function scored(series: PaceDay[]): Array<PaceDay & { pace: DailyPace }> {
  return series.filter((d): d is PaceDay & { pace: DailyPace } => d.pace !== null);
}

export function paceTrend(series: PaceDay[]): PaceTrend | null {
  const points = scored(series);
  if (points.length < 2) return null;
  const diff = points[points.length - 1].pace.total - points[0].pace.total;
  if (diff >= 5) return { tone: "up", label: "이번 주 상승세", diff };
  if (diff <= -5) return { tone: "down", label: "지난 학습보다 낮아요", diff };
  return { tone: "flat", label: "비슷해요", diff };
}

export const PACE_MAX: PaceParts = { persistence: 25, process: 25, reflection: 20, goal: 30 };
export const PACE_PART_LABELS: Record<keyof PaceParts, string> = {
  persistence: "학습 지속성",
  process: "학습 과정 기록",
  reflection: "자기 성찰",
  goal: "목표 달성",
};
const HINTS: Record<keyof PaceParts, string> = {
  persistence: "학습 시간이 평소보다 짧았어요. 조금 더 이어서 공부해 보세요.",
  process: "기록이 평소보다 적었어요. 궁금한 점이나 메모를 10자 이상 남겨 보세요.",
  reflection: "자기 성찰 점수가 낮았어요. 돌아보기에 남은 질문을 적어 보세요.",
  goal: "목표 달성 점수가 낮았어요. 목표를 작게 세우고 끝까지 해 보세요.",
};

function hint(selected: DailyPace | null): string {
  if (!selected) return "";
  const keys = Object.keys(PACE_MAX) as Array<keyof PaceParts>;
  const weakest = keys.reduce((w, k) => (selected.parts[k] / PACE_MAX[k] < selected.parts[w] / PACE_MAX[w] ? k : w), keys[0]);
  if (selected.parts[weakest] >= PACE_MAX[weakest]) return " 모든 항목을 고르게 채웠어요.";
  return ` ${HINTS[weakest]}`;
}

/** 규칙 기반 한 줄 피드백 (AI 호출 없음) */
export function paceFeedback(series: PaceDay[], selected: DailyPace | null): string {
  const points = scored(series);
  if (points.length === 0) return "이번 주 학습 기록이 아직 없어요. 학습을 시작하면 Pace 지수가 생겨요.";
  const first = points[0];
  let head: string;
  if (points.length === 1) {
    head = `이번 주는 ${first.label}요일에 Pace 지수 ${first.pace.total}점이었어요.`;
  } else {
    const diff = points[points.length - 1].pace.total - first.pace.total;
    head =
      diff >= 5
        ? `이번 주 Pace 지수는 ${first.label}요일보다 ${diff}점 높아졌어요.`
        : diff <= -5
          ? `이번 주 Pace 지수는 ${first.label}요일보다 ${-diff}점 낮아졌어요.`
          : `이번 주 Pace 지수는 ${first.label}요일과 비슷해요.`;
  }
  return head + hint(selected);
}
