// 프론트 형식 ↔ 백엔드(Supabase) 형식 변환. 순수 함수만 둔다.
import { GOAL_ACTIVITIES, REFLECTION_ITEMS } from "../lib/checklists";
import type { AuditLog, ClassAnalyticsRaw, Feedback, Consent, ConsentKind, LearningSession, Dashboard, DashboardRow, GroundedItem, Reflection, SessionGoal, StudentQuizQuestion, User } from "../types/domain";
import { ApiError, type ApiErrorCode } from "./types";

const SEP = " | ";
const GOAL_MAX = 200; // sessions.goal check (1~200자)

/** 백엔드 sessions.goal 은 텍스트 하나 → "과목 | 활동라벨, ... | 메모" */
export function goalToText(goal: SessionGoal): string {
  // 자유 입력에 구분자(" | ")가 있으면 다시 읽을 때 깨지므로 " / "로 바꾼다
  const clean = (t: string) => t.replace(/\s*\|\s*/g, " / ").trim();
  const labels = goal.activities.map((id) => GOAL_ACTIVITIES.find((a) => a.id === id)?.label ?? id);
  const note = goal.note?.trim() ? clean(goal.note) : "";
  // 형식: "오늘 할 것 | 활동 | 메모". 메모가 있으면 활동 칸이 비어도 자리를 남겨 메모가 활동으로 읽히지 않게 한다
  const tailText = note ? SEP + labels.join(", ") + SEP + note : labels.length ? SEP + labels.join(", ") : "";
  // 200자를 넘으면 활동·메모는 지키고 '오늘 할 것'을 줄인다
  const budget = Math.max(1, GOAL_MAX - Array.from(tailText).length);
  const subject = Array.from(clean(goal.subject)).slice(0, budget).join("");
  return Array.from(subject + tailText).slice(0, GOAL_MAX).join("");
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
  lastQuizRate?: number | null; // v0.5.1: 최근 응시 정답률(기록 공유 미동의면 null)
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
    lastQuizRate: typeof s.lastQuizRate === "number" ? s.lastQuizRate : null,
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
  CONSENT_REQUIRED: "CONSENT_REQUIRED",
  GUARDIAN_CONSENT_REQUIRED: "GUARDIAN_CONSENT_REQUIRED",
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
  if (err.code === "GUARDIAN_CONSENT_REQUIRED" || m.includes("GUARDIAN_CONSENT_REQUIRED")) return new ApiError("GUARDIAN_CONSENT_REQUIRED");
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

/** 서버 출제 응답에서 학생 화면에 필요한 필드만 (서버가 실수로 정답을 넣어도 화면·캐시에 남지 않게) */
export function pickQuizQuestions(raw: unknown[]): StudentQuizQuestion[] {
  return raw.map((x) => {
    const q = x as Record<string, unknown>;
    const out: StudentQuizQuestion = {
      id: String(q.id),
      type: q.type === "OX" ? "OX" : "MCQ",
      prompt: String(q.prompt ?? ""),
      choices: Array.isArray(q.choices) ? q.choices.map(String) : [],
    };
    if (typeof q.reported === "boolean") out.reported = q.reported;
    return out;
  });
}

/** v_me 행 → User */
export function rowToUser(row: Record<string, unknown>): User {
  return { id: String(row.id), name: String(row.name), role: row.role === "teacher" ? "teacher" : "student", classId: String(row.classId), number: (row.number as number) ?? undefined, under14: row.under14 === true };
}

/** 동의 입력 → consents insert 행 (snake_case) */
export function consentRows(studentId: string, policyVersion: string, input: Array<{ kind: ConsentKind; granted: boolean; byGuardian: boolean }>) {
  return input.map((c) => ({ student_id: studentId, kind: c.kind, granted: c.granted, by_guardian: c.byGuardian, policy_version: policyVersion }));
}

type QType = "CONCEPT" | "CHECK" | "ANSWER" | "OTHER";
const QTYPES: QType[] = ["CONCEPT", "CHECK", "ANSWER", "OTHER"];

/** 실제 조회 결과 → 반 분석 원자료. AI 답은 빼고, 기록 공유 미동의 학생의 질문·응시·주제는 한 번 더 거른다 */
export function buildAnalyticsRaw(input: {
  classId: string;
  from: string;
  to: string;
  students: Array<{ studentId: string; name: string; number: number; shared: boolean }>;
  sessions: LearningSession[];
  aiRows: Array<Record<string, unknown>>;
  attemptRows: Array<Record<string, unknown>>;
  topicRows: Array<Record<string, unknown>>;
}): ClassAnalyticsRaw {
  const shared = new Set(input.students.filter((s) => s.shared).map((s) => s.studentId));
  const owner = new Map(input.sessions.filter((s) => shared.has(s.studentId)).map((s) => [s.id, s.studentId]));
  const sid = (r: Record<string, unknown>) => String(r.sessionId ?? "");
  return {
    classId: input.classId,
    from: input.from,
    to: input.to,
    students: input.students,
    sessions: input.sessions,
    questions: input.aiRows
      .filter((r) => r.role !== "ai" && owner.has(sid(r)))
      .map((r) => ({
        id: String(r.id),
        sessionId: sid(r),
        studentId: owner.get(sid(r))!,
        content: String(r.content ?? ""),
        createdAt: String(r.createdAt ?? ""),
        questionType: QTYPES.includes(r.questionType as QType) ? (r.questionType as QType) : null,
      })),
    attempts: input.attemptRows
      .filter((r) => owner.has(sid(r)))
      .map((r) => ({ sessionId: sid(r), studentId: owner.get(sid(r))!, topicId: String(r.topicId), correct: Number(r.correct ?? 0), total: Number(r.total ?? 0), createdAt: String(r.createdAt ?? "") })),
    sessionTopics: input.topicRows
      .filter((r) => owner.has(sid(r)))
      .map((r) => ({ sessionId: sid(r), topicId: String(r.topicId), name: String(r.name ?? "") })),
  };
}

/** class_dashboard의 shared 값으로 기록 공유 여부 판정. 값이 없거나 이상하면 비공개로 본다 (fail-closed) */
export function isShared(v: unknown): boolean {
  return v === true;
}

/** in(...) 목록이 URL 한도를 넘지 않게 나눈다 */
export function chunk<T>(xs: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

/** PostgREST 최대 행 수에 잘리지 않게 페이지를 끝까지 받는다 */
export async function fetchAllPages<T>(page: (from: number, to: number) => PromiseLike<T[]>, pageSize = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const rows = await page(from, from + pageSize - 1);
    out.push(...rows);
    if (rows.length < pageSize) return out;
  }
}

/** v_feedback 행 → Feedback */
export function rowToFeedback(r: Record<string, unknown>): Feedback {
  return { id: String(r.id), sessionId: String(r.sessionId), teacherId: String(r.teacherId), content: String(r.content), createdAt: String(r.createdAt), readAt: typeof r.readAt === "string" ? r.readAt : null };
}

/** v_audit_logs 행 → AuditLog */
export function rowToAuditLog(r: Record<string, unknown>): AuditLog {
  return {
    id: String(r.id),
    actorId: String(r.actorId ?? ""),
    actorName: String(r.actorName ?? ""),
    action: String(r.action ?? ""),
    studentId: r.studentId == null ? null : String(r.studentId),
    createdAt: String(r.createdAt ?? ""),
  };
}
