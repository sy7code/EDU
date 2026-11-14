// 실제 백엔드(Supabase) 어댑터. 백엔드 전달 문서(FRONTEND_NOTES.md, api-spec v0.1 기준)를 따른다.
// 읽기: v_* view (camelCase) / 쓰기: 원본 테이블 (snake_case) / 로직: Edge Function /functions/v1/api
// 백엔드에 없는 기능(동의, QR 인증, 교차채점, 단원 테스트)은 화면에서 숨기고 여기선 지원 안 함.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  AiMessage,
  AuthEvent,
  Consent,
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
import { buildAnalyticsRaw, chunk, normalizeReportedQuestion, toReportOutcome, rowToAuditLog, rowToFeedback, consentRows, fetchAllPages, isShared, goalToText, latestConsents, pickQuizQuestions, mapDashboard, mapFnError, mapPgError, realtimeStatus, rowToReflection, rowToUser, textToGoal, toGrounded } from "./supabaseMappers";

const POLICY_VERSION = "2026-11-v1";
import { ApiError, type Api } from "./types";
import { paceSince, paceVisibleEntries } from "../lib/pace";

type Row = Record<string, unknown>;

function notSupported(): never {
  throw new ApiError("UNKNOWN", "not supported by backend");
}

/** 서울 날짜 YYYY-MM-DD */
function seoulDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}


function mapEntry(r: Row): LearningEntry {
  return {
    id: String(r.id),
    sessionId: String(r.sessionId),
    kind: (r.kind as LearningEntry["kind"]) ?? "MEMO",
    content: String(r.content ?? ""),
    visibility: r.visibility === "PRIVATE" ? "PRIVATE" : "TEACHER",
    createdAt: String(r.createdAt),
  };
}

function mapSession(r: Row): LearningSession {
  return {
    id: String(r.id),
    studentId: String(r.studentId),
    goal: textToGoal(String(r.goal ?? "")),
    startedAt: String(r.startedAt),
    endedAt: (r.endedAt as string | null) ?? null,
    startAuth: (r.startAuth as LearningSession["startAuth"]) ?? "QR",
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
    method: (r.method as AuthEvent["method"]) ?? "QR",
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

  /** 세션 ID로 100개씩 나눠 조회 (URL 길이). 돌아보기는 세션당 하나라 sessionId 정렬로 충분, 나머지는 id로 경계 고정 */
  async function rowsBySessions(view: string, sessionIds: string[], opts: { columns?: string; eq?: Record<string, string> } = {}): Promise<Row[]> {
    const out: Row[] = [];
    for (const part of chunk(sessionIds, 100)) {
      out.push(
        ...(await fetchAllPages(async (a, b) => {
          // eq: 서버에서 거르는 조건 (예: Pace는 교사 공개 기록만). columns: 필요한 컬럼만
          const base = sb.from(view).select(opts.columns).in("sessionId", part);
          const filtered = Object.entries(opts.eq ?? {}).reduce((q, [k, v]) => q.eq(k, v), base);
          const q = filtered.order("sessionId");
          return ok(await (view === "v_reflections" ? q : q.order("id")).range(a, b)) as unknown as Row[];
        })),
      );
    }
    return out;
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
      // local: 같은 데모 계정으로 다른 곳(백엔드 테스트 등)에 로그인한 세션은 끊지 않는다 (기본값 global)
      await sb.auth.signOut({ scope: "local" });
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
    issueQrToken: async () => notSupported(), // 백엔드 QR 배포 전 (docs/backend 요청서 v1.0-qr)
    submitCodeAuth: async () => notSupported(),
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
    // 개발용 '인증 건너뛰기'. 백엔드 QR이 배포되면 이 함수와 화면 버튼을 지운다 (서버 엔드포인트 이름은 옛 것을 그대로 씀)
    devSkipAuth: async () => mapAuthEvent(await fn<Row>("POST", "/dev/facepass/simulate", {})),

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
    listSessions: async ({ studentId, subject }) => {
      const u = await requireMe();
      const target = u.role === "student" ? u.id : studentId;
      if (!target) throw new ApiError("VALIDATION");
      const rows = ok(await sb.from("v_sessions").select().eq("studentId", target).order("startedAt", { ascending: false })) as Row[];
      const list = rows.map(mapSession);
      // 교과 교사 권한은 백엔드에 아직 없음: 과목 필터만 화면 편의로 적용 (권한 경계 아님)
      return subject ? list.filter((s) => s.goal.subject === subject) : list;
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
      return rows.map(mapEntry);
    },
    subscribeEntries: (sessionId, onChange, onStatus) => {
      // RLS가 적용된 Realtime: 볼 수 있는 행의 INSERT만 온다. 내용은 쓰지 않고 다시 불러오는 신호로만 쓴다
      let subscribed = false;
      let removed = false;
      const ch = sb
        .channel(`entries:${sessionId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "entries", filter: `session_id=eq.${sessionId}` }, () => onChange())
        .subscribe((status) => {
          if (removed) return; // 우리가 해제해서 닫힌 건 알리지 않음
          const s = realtimeStatus(status, subscribed);
          if (status === "SUBSCRIBED") subscribed = true;
          if (s) onStatus?.(s);
        });
      return () => {
        removed = true;
        void sb.removeChannel(ch);
      };
    },
    listMyNotes: async () => {
      const u = await requireMe();
      if (u.role !== "student") throw new ApiError("FORBIDDEN");
      // 세션이 1000개를 넘어도 잘리지 않게 페이지로 (id로 정렬해 경계 고정)
      const sessions = (await fetchAllPages(async (a, b) => ok(await sb.from("v_sessions").select().eq("studentId", u.id).order("id").range(a, b)) as Row[])).map(mapSession);
      // 세션 ID로 100개씩 나눠 조회 (URL 길이). 돌아보기는 세션당 하나라 sessionId 정렬로 충분
      const ids = sessions.map((x) => x.id);
      const [entryRows, reflRows] = await Promise.all([rowsBySessions("v_entries", ids), rowsBySessions("v_reflections", ids)]);
      return { sessions, entries: entryRows.map(mapEntry), reflections: reflRows.map(rowToReflection) };
    },

    // ---------- AI ----------
    listAiMessages: async (sessionId) => {
      const rows = ok(await sb.from("v_ai_messages").select().eq("sessionId", sessionId).order("createdAt")) as Row[];
      return rows.map(mapAi);
    },
    askAi: async (sessionId, content) => mapAi(await fn<Row>("POST", `/sessions/${encodeURIComponent(sessionId)}/ai/messages`, { content })),
    ocrPaperPhoto: async (sessionId, imageDataUrl) => {
      const r = await fn<{ text?: unknown }>("POST", `/sessions/${encodeURIComponent(sessionId)}/ocr`, { image: imageDataUrl });
      return { text: typeof r?.text === "string" ? r.text : "" };
    },
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
      return rows.map(rowToFeedback);
    },
    addFeedback: async (sessionId, content) => {
      const u = await requireMe();
      const id = crypto.randomUUID();
      const text = content.trim();
      ok(await sb.from("feedback").insert({ id, session_id: sessionId, teacher_id: u.id, content: text }));
      return { id, sessionId, teacherId: u.id, content: text, createdAt: new Date().toISOString(), readAt: null };
    },
    markFeedbackRead: async (feedbackId) => {
      // 학생 본인 것만, read_at만 바뀜(서버 RLS). 이미 읽은 것은 다시 쓰지 않음
      ok(await sb.from("feedback").update({ read_at: new Date().toISOString() }).eq("id", feedbackId).is("read_at", null));
    },
    // 교과 교사 subject 기록은 백엔드 미반영. 담임 열람만 기록된다
    logStudentView: async (studentId) => {
      ok(await sb.rpc("log_student_view", { p_student_id: studentId }));
    },
    listAuditLogs: async () => {
      const rows = ok(await sb.from("v_audit_logs").select().order("createdAt", { ascending: false }).limit(10)) as Row[]; // 학생 화면 "최근 10개"
      return rows.map(rowToAuditLog);
    },

    // ---------- 교과 교사 (백엔드 미반영) ----------
    listMyAssignments: async () => {
      throw new ApiError("UNKNOWN", "subject teacher not deployed");
    },
    getReviewInputs: async () => {
      throw new ApiError("UNKNOWN", "subject teacher not deployed");
    },
    getSubjectSummary: async () => {
      throw new ApiError("UNKNOWN", "subject teacher not deployed");
    },
    listSubjectStudents: async () => {
      throw new ApiError("UNKNOWN", "subject teacher not deployed");
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
    reportQuestion: async (sessionId, questionId, reason) =>
      toReportOutcome(await fn<unknown>("POST", `/sessions/${encodeURIComponent(sessionId)}/quiz/report`, { questionId, reason })),
    submitQuiz: async (sessionId, answers) => fn<QuizAttempt>("POST", `/sessions/${encodeURIComponent(sessionId)}/quiz/submit`, { answers }),

    // 주제별 성장·신고 (명세 v0.5: RPC + 함수)
    getTopicGrowth: async (studentId) => {
      const raw = ok(await sb.rpc("student_topic_growth", { p_student_id: studentId })) as { shared?: boolean; topics?: GrowthReport["topics"] } | null;
      // RPC엔 전체 횟수·시간이 없어 세션 view로 계산 (교사는 동의와 무관하게 세션 시간은 봄)
      const rows = ok(await sb.from("v_sessions").select("durationMinutes").eq("studentId", studentId)) as Row[];
      const total = { sessions: rows.length, minutes: rows.reduce((n, r) => n + ((r.durationMinutes as number) ?? 0), 0) };
      // 교사가 볼 때는 shared === true일 때만 공유로 본다 (값이 없거나 이상하면 비공개, fail-closed). 학생 본인은 자기 기록이라 그대로
      const u = await requireMe();
      const shared = u.role === "teacher" ? isShared(raw?.shared) : raw?.shared !== false;
      return { studentId, shared, topics: shared ? (raw?.topics ?? []) : [], total };
    },
    // Pace 지수: 기존 view로 읽어 프론트에서 계산 (백엔드 변경 없음). 권한은 view RLS가 막는다
    getPaceInputs: async (studentId) => {
      const u = await requireMe();
      if (u.role === "student" && u.id !== studentId) throw new ApiError("NOT_FOUND");
      if (u.role === "teacher") {
        const raw = ok(await sb.rpc("student_topic_growth", { p_student_id: studentId })) as { shared?: boolean } | null;
        // shared === true일 때만 공유로 본다 (값이 없거나 이상하면 비공개, fail-closed)
        if (!isShared(raw?.shared)) return { shared: false, sessions: [], entries: [], reflections: [], attempts: [] };
      }
      // 이번 주 월요일의 평소(이전 28일)까지만 읽는다
      const since = paceSince(new Date());
      const sessions = (
        await fetchAllPages(async (a, b) => ok(await sb.from("v_sessions").select().eq("studentId", studentId).gte("startedAt", since).order("id").range(a, b)) as Row[])
      ).map(mapSession);
      const ids = sessions.map((x) => x.id);
      // '나만 보기'는 점수에 안 들어가므로 서버에서부터 받지 않는다 (학생·교사 모두). 아래 paceVisibleEntries는 한 번 더 거르는 안전망
      const [entryRows, reflRows, attemptRows] = await Promise.all([
        rowsBySessions("v_entries", ids, { eq: { visibility: "TEACHER" } }),
        // changed: 예전 형식 돌아보기를 rowToReflection이 읽을 때 필요
        rowsBySessions("v_reflections", ids, { columns: "sessionId,checks,understanding,remainingQuestions,note,changed" }),
        rowsBySessions("v_quiz_attempts", ids, { columns: "id,sessionId,correct,total,createdAt" }),
      ]);
      return {
        shared: true,
        sessions,
        entries: paceVisibleEntries(entryRows.map(mapEntry)),
        reflections: reflRows.map(rowToReflection),
        attempts: attemptRows.map((r) => ({
          sessionId: String(r.sessionId),
          correct: Number(r.correct ?? 0),
          total: Number(r.total ?? 0),
          createdAt: String(r.createdAt),
        })),
      };
    },
    listReportedQuestions: async (classId) => ((ok(await sb.rpc("class_reported_questions", { p_class_id: classId })) as ReportedQuestion[]) ?? []).map(normalizeReportedQuestion),
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
