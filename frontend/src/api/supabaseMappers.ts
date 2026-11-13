// 프론트 형식 ↔ 백엔드(Supabase) 형식 변환. 순수 함수만 둔다.
import { GOAL_ACTIVITIES, REFLECTION_ITEMS } from "../lib/checklists";
import type { Consent, Dashboard, DashboardRow, GroundedItem, Reflection, SessionGoal } from "../types/domain";
import { ApiError, type ApiErrorCode } from "./types";

const SEP = " | ";
const GOAL_MAX = 200; // sessions.goal check (1~200자)

/** 백엔드 sessions.goal 은 텍스트 하나 → "과목 | 활동라벨, ... | 메모" */
export function goalToText(goal: SessionGoal): string {
  const labels = goal.activities.map((id) => GOAL_ACTIVITIES.find((a) => a.id === id)?.label ?? id);
  const parts = [goal.subject, labels.join(", ")];
  if (goal.note?.trim()) parts.push(goal.note.trim());
  const text = parts.filter((p, i) => i === 0 || p).join(SEP);
  return Array.from(text).slice(0, GOAL_MAX).join("");
}

export function textToGoal(text: string): SessionGoal {
  const parts = text.split(SEP);
  if (parts.length < 2) return { subject: text, activities: [] };
  const [subject, labels, ...rest] = parts;
  const activities = labels
    .split(", ")
    .filter(Boolean)
    .map((l) => GOAL_ACTIVITIES.find((a) => a.label === l)?.id ?? l);
  const note = rest.join(SEP).trim();
  return note ? { subject, activities, note } : { subject, activities };
}

// 성찰: 백엔드 reflections.changed(텍스트)에 체크리스트를 사람이 읽을 수 있는 형식으로 저장
const U_PREFIX = "이해도: ";
const C_PREFIX = "✓ ";
const N_PREFIX = "메모: ";

export function reflectionToChanged(r: Reflection): string {
  const lines: string[] = [];
  if (r.understanding) lines.push(`${U_PREFIX}${r.understanding}/3`);
  for (const id of r.checks) lines.push(`${C_PREFIX}${REFLECTION_ITEMS.find((x) => x.id === id)?.label ?? id}`);
  if (r.note?.trim()) lines.push(`${N_PREFIX}${r.note.trim()}`);
  return lines.join("\n").slice(0, 2000);
}

export function changedToReflection(sessionId: string, changed: string, remainingQuestions: string[], updatedAt: string): Reflection {
  const lines = changed.split("\n");
  const u = lines.find((l) => l.startsWith(U_PREFIX))?.slice(U_PREFIX.length).match(/^([123])\/3$/);
  if (!u) {
    // 체크리스트 형식이 아닌 예전 주관식
    return { sessionId, checks: [], understanding: null, remainingQuestions, legacyText: changed, updatedAt };
  }
  const checks = lines
    .filter((l) => l.startsWith(C_PREFIX))
    .map((l) => l.slice(C_PREFIX.length))
    .map((label) => REFLECTION_ITEMS.find((x) => x.label === label)?.id ?? label);
  const noteLine = lines.find((l) => l.startsWith(N_PREFIX));
  const base: Reflection = { sessionId, checks, understanding: Number(u[1]) as 1 | 2 | 3, remainingQuestions, updatedAt };
  return noteLine ? { ...base, note: noteLine.slice(N_PREFIX.length) } : base;
}

/** 요약 항목: 백엔드는 문자열 배열(근거 ID 없음) */
export function toGrounded(items: unknown[]): GroundedItem[] {
  return items
    .map((x) => {
      if (typeof x === "string") return { text: x, evidenceIds: [] };
      if (x && typeof x === "object" && typeof (x as GroundedItem).text === "string") {
        const g = x as GroundedItem;
        return { text: g.text, evidenceIds: Array.isArray(g.evidenceIds) ? g.evidenceIds : [] };
      }
      return null;
    })
    .filter((x): x is GroundedItem => x !== null);
}

type RawDashboardRow = {
  studentId: string;
  name: string;
  number: number;
  sessionCount: number;
  totalMinutes: number;
  openQuestionCount: number;
  lastSessionAt: string | null;
  needsAttention: boolean;
  hasReflectionWithoutFeedback?: boolean;
};

/** RPC class_dashboard → 프론트 Dashboard. 백엔드에 없는 값은 기본값 */
export function mapDashboard(
  raw: { classId: string; from: string; to: string; students?: RawDashboardRow[] },
  activeStudentIds: Set<string>,
): Dashboard {
  const students: DashboardRow[] = (raw.students ?? []).map((s) => ({
    studentId: s.studentId,
    name: s.name,
    number: s.number ?? 0,
    sessionCount: s.sessionCount ?? 0,
    totalMinutes: s.totalMinutes ?? 0,
    openQuestionCount: s.openQuestionCount ?? 0,
    lastSessionAt: s.lastSessionAt ?? null,
    needsAttention: !!s.needsAttention,
    activeNow: activeStudentIds.has(s.studentId),
    pendingAssessment: 0,
    lastQuizRate: null,
  }));
  return { classId: raw.classId, from: raw.from, to: raw.to, students };
}

const FN_CODES: Record<string, ApiErrorCode> = {
  UNAUTHORIZED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  UNKNOWN_USER: "NOT_FOUND",
  SESSION_ALREADY_ACTIVE: "SESSION_ALREADY_ACTIVE",
  SESSION_ALREADY_ENDED: "SESSION_ALREADY_ENDED",
  SESSION_NOT_ACTIVE: "SESSION_NOT_ACTIVE",
  SESSION_NOT_ENDED: "SESSION_NOT_ACTIVE",
  AUTH_EVENT_INVALID: "AUTH_EVENT_INVALID",
  AUTH_STUDENT_MISMATCH: "AUTH_STUDENT_MISMATCH",
  TOO_LONG: "VALIDATION",
  VALIDATION: "VALIDATION",
  RATE_LIMITED: "RATE_LIMITED",
  AI_TIMEOUT: "AI_TIMEOUT",
  AI_UNAVAILABLE: "AI_TIMEOUT",
  QUIZ_NOT_AVAILABLE: "QUIZ_NOT_AVAILABLE",
  QUIZ_ALREADY_TAKEN: "QUIZ_ALREADY_TAKEN",
  AI_BAD_OUTPUT: "AI_BAD_OUTPUT",
};

/** Edge Function 에러 { error: { code, message } } → ApiError (화면 문구는 프론트 사전 사용) */
export function mapFnError(status: number, body: unknown): ApiError {
  const code = (body as { error?: { code?: string } } | null)?.error?.code;
  if (code && FN_CODES[code]) return new ApiError(FN_CODES[code], code);
  if (status === 401) return new ApiError("UNAUTHENTICATED");
  if (status === 403) return new ApiError("FORBIDDEN");
  if (status === 404) return new ApiError("NOT_FOUND");
  return new ApiError("UNKNOWN", `HTTP ${status}`);
}

/** PostgREST(테이블 직접 쓰기·RPC) 에러 → ApiError */
export function mapPgError(err: { message?: string; code?: string }): ApiError {
  const m = err.message ?? "";
  // 수정본 백엔드: 의미 있는 에러는 code로 온다 (message는 한국어 문장)
  if (err.code === "SESSION_NOT_ACTIVE") return new ApiError("SESSION_NOT_ACTIVE");
  if (err.code === "NOT_FOUND") return new ApiError("NOT_FOUND");
  if (err.code === "42501") return new ApiError("FORBIDDEN");
  if (m.includes("SESSION_NOT_ACTIVE")) return new ApiError("SESSION_NOT_ACTIVE");
  if (m.includes("row-level security")) return new ApiError("FORBIDDEN");
  if (m.includes("NOT_FOUND")) return new ApiError("NOT_FOUND");
  if (m.includes("JWT") || err.code === "PGRST301") return new ApiError("UNAUTHENTICATED");
  if (m.includes("check constraint") || m.includes("violates")) return new ApiError("VALIDATION");
  return new ApiError("UNKNOWN", "db error");
}

/** v_reflections 행 → Reflection. 체크리스트 컬럼(understanding)이 있으면 그것을, 없으면 예전 changed 텍스트를 읽는다 */
export function rowToReflection(row: Record<string, unknown>): Reflection {
  const sessionId = String(row.sessionId ?? "");
  const remaining = (row.remainingQuestions as string[] | null) ?? [];
  const updatedAt = String(row.updatedAt ?? "");
  const u = row.understanding as number | null | undefined;
  if (u === 1 || u === 2 || u === 3) {
    const base: Reflection = { sessionId, checks: (row.checks as string[] | null) ?? [], understanding: u, remainingQuestions: remaining, updatedAt };
    const note = row.note as string | null | undefined;
    return note ? { ...base, note } : base;
  }
  return changedToReflection(sessionId, String(row.changed ?? ""), remaining, updatedAt);
}

/** consents 이력 → 종류별 최신 값 */
export function latestConsents(rows: Array<Record<string, unknown>>): Consent[] {
  const latest = new Map<string, Consent>();
  const sorted = [...rows].sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")));
  for (const r of sorted) {
    const kind = String(r.kind) as Consent["kind"];
    latest.set(kind, {
      kind,
      granted: r.granted === true,
      byGuardian: r.byGuardian === true,
      policyVersion: String(r.policyVersion ?? ""),
      createdAt: String(r.createdAt ?? ""),
    });
  }
  return [...latest.values()];
}
