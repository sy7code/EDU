// 실제 백엔드(Supabase) 어댑터. 백엔드 전달 문서(FRONTEND_NOTES.md, api-spec v0.1 기준)를 따른다.
// 읽기: v_* view (camelCase) / 쓰기: 원본 테이블 (snake_case) / 로직: Edge Function /functions/v1/api
// 백엔드에 없는 기능(동의, QR·바코드·교사 확인, 교차채점, 단원 테스트)은 화면에서 숨기고 여기선 지원 안 함.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  AiMessage,
  AuthEvent,
  Consent,
  Feedback,
  LearningEntry,
  LearningSession,
  GrowthReport,
  QuizAttempt,
  ReportedQuestion,
  Reflection,
  SessionTopic,
  Student,
  User,
} from "../types/domain";
import { buildAnalyticsRaw, chunk, consentRows, fetchAllPages, isShared, goalToText, latestConsents, pickQuizQuestions, mapDashboard, mapFnError, mapPgError, rowToReflection, rowToUser, textToGoal, toGrounded } from "./supabaseMappers";

const POLICY_VERSION = "2026-11-v1";
import { ApiError, type Api } from "./types";

type Row = Record<string, unknown>;

function notSupported(): never {
  throw new ApiError("UNKNOWN", "not supported by backend");
}

/** 서울 날짜 YYYY-MM-DD */
function seoulDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function mapSession(r: Row): LearningSession {
  return {
    id: String(r.id),
    studentId: String(r.studentId),
    goal: textToGoal(String(r.goal ?? "")),
    startedAt: String(r.startedAt),
    endedAt: (r.endedAt as string | null) ?? null,
    startAuth: (r.startAuth as LearningSession["startAuth"]) ?? "FACEPASS",
    endAuth: (r.endAuth as LearningSession["endAuth"]) ?? null,
    status: r.status === "ENDED" ? "ENDED" : "ACTIVE",
    durationMinutes: (r.durationMinutes as number | null) ?? null,
  };
}

function mapAuthEvent(r: Row): AuthEvent {
  return {
    id: String(r.id),
    studentId: (r.studentId as string | null) ?? null,
    maskedName: (r.studentName as string | null) ?? null,
    deviceId: String(r.deviceId ?? ""),
    method: (r.method as AuthEvent["method"]) ?? "FACEPASS",
    success: r.success !== false,
    verifiedAt: String(r.verifiedAt ?? new Date().toISOString()),
    consumed: !!r.consumedAt,
  };
}

function mapAi(r: Row): AiMessage {
  return { id: String(r.id), sessionId: String(r.sessionId), role: r.role === "ai" ? "ai" : "student", content: String(r.content ?? ""), createdAt: String(r.createdAt) };
}

export function createSupabaseApi(url: string, anonKey: string): Api {
  const sb: SupabaseClient = createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  const fnBase = `${url.replace(/\/$/, "")}/functions/v1/api`;
  let meCache: User | null = null;

  async function token(): Promise<string> {
    const { data } = await sb.auth.getSession();
    const t = data.session?.access_token;
    if (!t) throw new ApiError("UNAUTHENTICATED");
    return t;
  }

  async function fn<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${fnBase}${path}`, {
      method,
      headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
      body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    if (!res.ok) throw mapFnError(res.status, json);
    return json as T;
  }

  /** PostgREST 결과 확인 */
  function ok<T>(res: { data: T | null; error: { message: string; code?: string } | null }): T {
    if (res.error) throw mapPgError(res.error);
    return res.data as T;
  }

  async function requireMe(): Promise<User> {
    const u = await api.me();
    if (!u) throw new ApiError("UNAUTHENTICATED");
    return u;
  }

  const api: Api = {
    // ---------- 계정 ----------
    listDemoUsers: async () => [],
    login: async () => notSupported(),
    signIn: async (email, password) => {
      const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw new ApiError("UNAUTHENTICATED", "로그인 실패");
      meCache = null;
      return requireMe();
    },
    logout: async () => {
      meCache = null;
      await sb.auth.signOut();
    },
    me: async () => {
      const { data } = await sb.auth.getSession();
      if (!data.session) {
        meCache = null;
        return null;
      }
      if (meCache && meCache.id === data.session.user.id) return meCache;
      const row = ok(await sb.from("v_me").select().maybeSingle()) as Row | null;
      if (!row) return null;
      meCache = rowToUser(row);
      return meCache;
    },

    // ---------- 동의 (백엔드 consents: 이력 append, 종류별 최신 행이 현재 값) ----------
    getConsents: async (): Promise<Consent[]> => {
      const u = await requireMe();
      if (u.role !== "student") return [];
      const rows = ok(await sb.from("v_consents").select().eq("studentId", u.id)) as Row[];
      return latestConsents(rows);
    },
    saveConsents: async (input) => {
      const u = await requireMe();
      if (u.role !== "student") throw new ApiError("FORBIDDEN");
      ok(await sb.from("consents").insert(consentRows(u.id, POLICY_VERSION, input)));
      return api.getConsents();
    },

    listStudents: async (classId) => {
      const rows = ok(await sb.from("v_students").select().eq("classId", classId).order("number")) as Row[];
      return rows.map((r): Student => ({ id: String(r.id), name: String(r.name), classId: String(r.classId), number: (r.number as number) ?? 0 }));
    },

    // ---------- 인증 ----------
    submitFaceAuth: async () => notSupported(), // 실제 단말기는 /facepass/result + 기기 토큰 (2일차)
    issueQrToken: async () => notSupported(),
    submitCodeAuth: async () => notSupported(),
    submitManualAuth: async () => notSupported(),
    getPendingAuthEvent: async () => {
      // 수정본: 인증이 없으면 200 + null (예전 404도 호환)
      try {
        const r = await fn<Row | null>("GET", "/auth-events/latest");
        return r ? mapAuthEvent(r) : null;
      } catch (e) {
        if (e instanceof ApiError && e.code === "NOT_FOUND") return null;
        throw e;
      }
    },
    simulateFaceAuth: async () => mapAuthEvent(await fn<Row>("POST", "/dev/facepass/simulate", {})),

    // ---------- 세션 ----------
    getActiveSession: async () => {
      const u = await requireMe();
      const row = ok(await sb.from("v_sessions").select().eq("studentId", u.id).eq("status", "ACTIVE").maybeSingle()) as Row | null;
      return row ? mapSession(row) : null;
    },
    startSession: async ({ goal, authEventId }) => {
      const u = await requireMe();
      return mapSession(await fn<Row>("POST", "/sessions", { studentId: u.id, goal: goalToText(goal), authEventId }));
    },
    endSession: async (sessionId, authEventId) => mapSession(await fn<Row>("POST", `/sessions/${encodeURIComponent(sessionId)}/end`, { authEventId })),
    getSession: async (sessionId) => {
      const row = ok(await sb.from("v_sessions").select().eq("id", sessionId).maybeSingle()) as Row | null;
      if (!row) throw new ApiError("NOT_FOUND");
      return mapSession(row);
    },
    listSessions: async ({ studentId }) => {
      const u = await requireMe();
      const target = u.role === "student" ? u.id : studentId;
      if (!target) throw new ApiError("VALIDATION");
      const rows = ok(await sb.from("v_sessions").select().eq("studentId", target).order("startedAt", { ascending: false })) as Row[];
      return rows.map(mapSession);
    },

    // ---------- 기록 ----------
    addEntry: async ({ sessionId, kind, content, visibility }) => {
      // 수정본: PAPER 허용, PAPER만 빈 내용 허용
      const text = content.trim();
      const id = crypto.randomUUID();
      ok(await sb.from("entries").insert({ id, session_id: sessionId, kind, content: text, visibility }));
      const e: LearningEntry = { id, sessionId, kind, content: text, visibility, createdAt: new Date().toISOString() };
      return e;
    },
    listEntries: async (sessionId) => {
      const rows = ok(await sb.from("v_entries").select().eq("sessionId", sessionId).order("createdAt")) as Row[];
      return rows.map((r): LearningEntry => ({
        id: String(r.id),
        sessionId: String(r.sessionId),
        kind: (r.kind as LearningEntry["kind"]) ?? "MEMO",
        content: String(r.content ?? ""),
        visibility: r.visibility === "PRIVATE" ? "PRIVATE" : "TEACHER",
        createdAt: String(r.createdAt),
      }));
    },

    // ---------- AI ----------
    listAiMessages: async (sessionId) => {
      const rows = ok(await sb.from("v_ai_messages").select().eq("sessionId", sessionId).order("createdAt")) as Row[];
      return rows.map(mapAi);
    },
    askAi: async (sessionId, content) => mapAi(await fn<Row>("POST", `/sessions/${encodeURIComponent(sessionId)}/ai/messages`, { content })),
    summarizeSession: async (sessionId) => {
      const r = await fn<{ activities?: unknown[]; remainingQuestions?: unknown[] }>("POST", `/sessions/${encodeURIComponent(sessionId)}/summary`);
      return { activities: toGrounded(r.activities ?? []), remainingQuestions: toGrounded(r.remainingQuestions ?? []) };
    },

    // ---------- 성찰·피드백 ----------
    getReflection: async (sessionId) => {
      const r = ok(await sb.from("v_reflections").select().eq("sessionId", sessionId).maybeSingle()) as Row | null;
      if (!r) return null;
      return rowToReflection(r);
    },
    saveReflection: async (r) => {
      const remaining = r.remainingQuestions.map((q) => q.trim()).filter(Boolean).slice(0, 5);
      // 수정본: 체크리스트 컬럼에 저장 (changed 는 비움)
      ok(
        await sb.from("reflections").upsert(
          { session_id: r.sessionId, changed: "", checks: r.checks, understanding: r.understanding, note: r.note?.trim() || null, remaining_questions: remaining },
          { onConflict: "session_id" },
        ),
      );
      const saved: Reflection = { ...r, remainingQuestions: remaining, updatedAt: new Date().toISOString() };
      return saved;
    },
    listFeedback: async (sessionId) => {
      const rows = ok(await sb.from("v_feedback").select().eq("sessionId", sessionId).order("createdAt")) as Row[];
      return rows.map((r): Feedback => ({ id: String(r.id), sessionId: String(r.sessionId), teacherId: String(r.teacherId), content: String(r.content), createdAt: String(r.createdAt) }));
    },
    addFeedback: async (sessionId, content) => {
      const u = await requireMe();
      const id = crypto.randomUUID();
      const text = content.trim();
      ok(await sb.from("feedback").insert({ id, session_id: sessionId, teacher_id: u.id, content: text }));
      return { id, sessionId, teacherId: u.id, content: text, createdAt: new Date().toISOString() };
    },

    // ---------- 교사 ----------
    getDashboard: async (classId) => {
      const to = new Date();
      const from = new Date(to.getTime() - 6 * 86400000);
      const raw = ok(await sb.rpc("class_dashboard", { p_class_id: classId, p_from: seoulDate(from), p_to: seoulDate(to) })) as Parameters<typeof mapDashboard>[0];
      const active = ok(await sb.from("v_sessions").select("studentId").eq("status", "ACTIVE")) as Row[];
      return mapDashboard(raw, new Set(active.map((r) => String(r.studentId))));
    },

    // ---------- 주제별 성장 (명세 v0.5, 백엔드 반영 전엔 FEATURES.quiz=false 로 숨김) ----------
    extractTopics: async (sessionId) => {
      const r = await fn<{ topics?: SessionTopic[] }>("POST", `/sessions/${encodeURIComponent(sessionId)}/topics`);
      return (r.topics ?? []).map((t) => ({ topicId: String(t.topicId), name: String(t.name), subject: t.subject, evidenceIds: t.evidenceIds ?? [] }));
    },

    // 주제 테스트 (명세 v0.5)
    getQuiz: async (sessionId, topicId) => {
      const r = await fn<{ topic: { id: string; name: string }; questions: unknown[] }>("POST", `/sessions/${encodeURIComponent(sessionId)}/quiz`, { topicId });
      return { topic: { id: String(r.topic.id), name: String(r.topic.name) }, questions: pickQuizQuestions(r.questions ?? []) };
    },
    reportQuestion: async (sessionId, questionId, reason) => {
      await fn("POST", `/sessions/${encodeURIComponent(sessionId)}/quiz/report`, { questionId, reason });
    },
    submitQuiz: async (sessionId, answers) => fn<QuizAttempt>("POST", `/sessions/${encodeURIComponent(sessionId)}/quiz/submit`, { answers }),

    // 주제별 성장·신고 (명세 v0.5: RPC + 함수)
    getTopicGrowth: async (studentId) => {
      const raw = ok(await sb.rpc("student_topic_growth", { p_student_id: studentId })) as { shared?: boolean; topics?: GrowthReport["topics"] } | null;
      // RPC엔 전체 횟수·시간이 없어 세션 view로 계산 (교사는 동의와 무관하게 세션 시간은 봄)
      const rows = ok(await sb.from("v_sessions").select("durationMinutes").eq("studentId", studentId)) as Row[];
      const total = { sessions: rows.length, minutes: rows.reduce((n, r) => n + ((r.durationMinutes as number) ?? 0), 0) };
      return { studentId, shared: raw?.shared !== false, topics: raw?.shared === false ? [] : (raw?.topics ?? []), total };
    },
    listReportedQuestions: async (classId) => (ok(await sb.rpc("class_reported_questions", { p_class_id: classId })) as ReportedQuestion[]) ?? [],
    resolveReport: async (reportId, action) => {
      await fn("POST", `/quiz/reports/${encodeURIComponent(reportId)}/resolve`, { action });
    },

    // ---------- 백엔드에 없는 기능: 화면에서 숨김. 공통 화면이 부르는 조회는 빈 값 ----------
    getClassAnalytics: async (classId, from, to) => {
      // 학생 명단·기록 공유 여부: class_dashboard 한 번 (백엔드 5-1). shared가 true일 때만 공유로 본다 (fail-closed)
      const dash = ok(await sb.rpc("class_dashboard", { p_class_id: classId, p_from: seoulDate(from), p_to: seoulDate(to) })) as {
        students?: Array<{ studentId: string; name: string; number: number; shared?: unknown }>;
      } | null;
      const students = (dash?.students ?? [])
        .map((r) => ({ studentId: String(r.studentId), name: String(r.name), number: r.number ?? 0, shared: isShared(r.shared) }))
        .sort((x, y) => x.number - y.number);
      const ids = students.map((s) => s.studentId);
      const fromIso = from.toISOString();
      const toIso = to.toISOString();
      const sessionRows: Row[] = ids.length
        ? await fetchAllPages(async (a, b) =>
            ok(await sb.from("v_sessions").select().in("studentId", ids).gte("startedAt", fromIso).lte("startedAt", toIso).order("id").range(a, b)) as Row[],
          )
        : [];
      const sessions = sessionRows.map(mapSession);
      // 세션 id 목록이 길면 URL 한도를 넘으므로 100개씩 나눠 조회하고, 각 조회도 행 수 한도에 잘리지 않게 끝까지 받는다
      const byChunks = async (view: string, cols: string, orderBy: string[], studentOnly = false): Promise<Row[]> => {
        const out: Row[] = [];
        for (const part of chunk(sessions.map((x) => x.id), 100)) {
          const rows = await fetchAllPages(async (a, b) => {
            const base = sb.from(view).select(cols).in("sessionId", part);
            const q = studentOnly ? base.neq("role", "ai") : base;
            // 페이지 경계가 흔들리지 않게 행마다 고유한 순서로 정렬
            const ordered = orderBy.reduce((acc, c) => acc.order(c), q);
            return ok(await ordered.range(a, b)) as unknown as Row[];
          });
          out.push(...rows);
        }
        return out;
      };
      const [aiRows, attemptRows, topicRows] = await Promise.all([
        byChunks("v_ai_messages", "id,sessionId,role,content,questionType,createdAt", ["id"], true),
        byChunks("v_quiz_attempts", "id,sessionId,studentId,topicId,correct,total,createdAt", ["id"]),
        byChunks("v_session_topics", "sessionId,topicId,name", ["sessionId", "topicId"]),
      ]);
      return buildAnalyticsRaw({ classId, from: fromIso, to: toIso, students, sessions, aiRows, attemptRows, topicRows });
    },
    getQuizAttempt: async (sessionId) => {
      const row = ok(await sb.from("v_quiz_attempts").select().eq("sessionId", sessionId).maybeSingle()) as QuizAttempt | null;
      return row ?? null;
    },
    getRubric: async () => notSupported(),
    getAssessment: async () => null,
    requestAiAssessment: async () => notSupported(),
    finalizeAssessment: async () => notSupported(),
  };
  return api;
}
