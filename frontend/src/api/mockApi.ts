// 백엔드 규칙(docs/api-spec.md)을 흉내 내는 mock. 화면 개발·데모용이며 보안 경계가 아니다.
// 실제 권한은 Supabase RLS·서버 함수가 강제해야 한다.
import { maskName, maskPii } from "../lib/privacy";
import { minutesBetween } from "../lib/time";
import { activityLabel } from "../lib/checklists";
import type {
  AiMessage,
  Assessment,
  AuthEvent,
  AuthMethod,
  Consent,
  ConsentKind,
  CriterionScore,
  DashboardRow,
  GroundedItem,
  LearningEntry,
  LearningSession,
  QuizAttempt,
  ReportedQuestion,
  SessionTopic,
  StudentQuizQuestion,
  TopicGrowth,
  User,
} from "../types/domain";
import type { Db, ServedQuestion } from "./mockData";
import { keywordHits, TOPIC_DICTIONARY, type DictionaryTopic } from "./mockTopicData";
import { ApiError, type Api } from "./types";

export type MockOptions = {
  seed: Db;
  now?: () => Date;
  latencyMs?: number;
  storage?: Storage | null;
  onAiPayload?: (payload: string) => void;
};

export const STORAGE_KEY = "growth-pace-mock-db-v6"; // 가짜 데이터만 저장 (구조 바뀌면 버전 올림)
export const SESSION_USER_KEY = "growth-pace-mock-user";
const AUTH_EVENT_TTL_MS = 120_000;
const QR_TTL_MS = 60_000;
const CODE_PER_MINUTE = 20;
const QUIZ_CONCEPT = 3; // 고정 난이도: 개념 확인 3
const QUIZ_APPLY = 2; // + 적용 2 = 5문항
const TOPICS_MAX = 3;
const SIGNAL_MIN_TOTAL = 3; // 채점 문항이 이보다 적으면 차이 신호를 내지 않음
const MAX_ENTRY = 2000;
const MAX_AI_INPUT = 1000;
const AI_PER_MINUTE = 10;
const POLICY_VERSION = "2026-11-v1";

export function createMockApi(opts: MockOptions): Api {
  const now = opts.now ?? (() => new Date());
  const latency = opts.latencyMs ?? 250;
  const storage = opts.storage === undefined ? safeStorage() : opts.storage;

  let db: Db = load() ?? structuredClone(opts.seed);
  let currentUserId: string | null = readSessionUser();
  let seq = 0;

  function load(): Db | null {
    if (!storage) return null;
    try {
      const raw = storage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Db) : null;
    } catch {
      return null;
    }
  }
  function save() {
    if (!storage) return;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch {
      /* 저장 실패해도 화면은 동작 */
    }
  }
  function readSessionUser(): string | null {
    if (!storage) return null;
    try {
      return sessionStorage.getItem(SESSION_USER_KEY);
    } catch {
      return null;
    }
  }
  function writeSessionUser(id: string | null) {
    if (!storage) return;
    try {
      if (id) sessionStorage.setItem(SESSION_USER_KEY, id);
      else sessionStorage.removeItem(SESSION_USER_KEY);
    } catch {
      /* noop */
    }
  }

  const iso = () => now().toISOString();
  const id = (p: string) => `${p}-${now().getTime().toString(36)}-${++seq}`;
  const delay = <T,>(v: T) =>
    latency > 0 ? new Promise<T>((r) => setTimeout(() => r(v), latency)) : Promise.resolve(v);
  const clone = <T,>(v: T): T => structuredClone(v);

  async function run<T>(fn: () => T): Promise<T> {
    db = load() ?? db; // 키오스크·학생 탭이 같은 브라우저 저장소를 공유하도록 매번 다시 읽음
    const result = fn(); // 예외는 그대로 reject
    save();
    return delay(clone(result));
  }

  // ---------- 권한 도우미 ----------
  function me(): User {
    const u = db.users.find((x) => x.id === currentUserId);
    if (!u) throw new ApiError("UNAUTHENTICATED");
    return u;
  }
  function teacher(): User {
    const u = me();
    if (u.role !== "teacher") throw new ApiError("FORBIDDEN");
    return u;
  }
  function userById(uid: string) {
    return db.users.find((u) => u.id === uid);
  }
  /** 동의는 이력으로 쌓고, 종류별 마지막 값이 현재 상태 */
  function currentConsents(studentId: string): Consent[] {
    const latest = new Map<ConsentKind, Consent>();
    for (const c of db.consents[studentId] ?? []) latest.set(c.kind, c);
    return [...latest.values()];
  }
  function hasConsent(studentId: string, kind: ConsentKind) {
    return currentConsents(studentId).some((c) => c.kind === kind && c.granted);
  }
  /** 교사가 이 학생의 기록(기록·AI 대화·성찰)을 볼 수 있는가: 기록 공유 동의가 현재 유효할 때만 */
  function sharedWithTeacher(studentId: string) {
    return hasConsent(studentId, "LEARNING_RECORD");
  }
  function isTeacherView() {
    return me().role === "teacher";
  }
  /** 본인 세션이거나 같은 반 교사일 때만. 아니면 존재를 숨기고 NOT_FOUND */
  function visibleSession(sessionId: string): LearningSession {
    const u = me();
    const s = db.sessions.find((x) => x.id === sessionId);
    if (!s) throw new ApiError("NOT_FOUND");
    if (u.role === "student" && s.studentId === u.id) return s;
    if (u.role === "teacher" && userById(s.studentId)?.classId === u.classId) return s;
    throw new ApiError("NOT_FOUND");
  }
  function ownActiveSession(sessionId: string): LearningSession {
    const u = me();
    const s = visibleSession(sessionId);
    if (u.role !== "student" || s.studentId !== u.id) throw new ApiError("FORBIDDEN");
    if (s.status !== "ACTIVE") throw new ApiError("SESSION_NOT_ACTIVE");
    return s;
  }
  function publicEntries(sessionId: string) {
    return db.entries.filter((e) => e.sessionId === sessionId && e.visibility === "TEACHER");
  }
  /** 교사에게 보여도 되는 기록: 공개 기록 + 현재 공유 동의 (철회하면 과거 공개분도 숨김) */
  function teacherEntries(s: LearningSession) {
    return sharedWithTeacher(s.studentId) ? publicEntries(s.id) : [];
  }
  function audit(action: string, targetStudentId: string | null) {
    db.auditLogs.push({ actorId: me().id, action, targetStudentId, at: iso() });
  }

  // ---------- 인증 이벤트 ----------
  function recordAuth(deviceId: string, studentId: string | null, method: AuthMethod, success: boolean): AuthEvent {
    const student = studentId ? userById(studentId) : undefined;
    const ev: AuthEvent = {
      id: id("auth"),
      studentId: success && student ? student.id : null,
      maskedName: success && student ? maskName(student.name) : null,
      deviceId,
      method,
      success: success && !!student,
      verifiedAt: iso(),
      consumed: false,
    };
    db.authEvents.push(ev);
    return ev;
  }
  /** notAfterIso: 이 시각 이후에 만들어진 이벤트만 허용 (종료 인증이 시작보다 앞서지 않게) */
  function consumeAuth(authEventId: string, studentId: string, notBeforeIso?: string): AuthEvent {
    const ev = db.authEvents.find((e) => e.id === authEventId);
    if (!ev || !ev.success || ev.consumed) throw new ApiError("AUTH_EVENT_INVALID");
    if (now().getTime() - new Date(ev.verifiedAt).getTime() > AUTH_EVENT_TTL_MS) {
      throw new ApiError("AUTH_EVENT_INVALID");
    }
    if (ev.studentId !== studentId) throw new ApiError("AUTH_STUDENT_MISMATCH");
    if (notBeforeIso && new Date(ev.verifiedAt).getTime() <= new Date(notBeforeIso).getTime()) {
      throw new ApiError("AUTH_EVENT_INVALID");
    }
    ev.consumed = true;
    return ev;
  }
  /** 한 번 쓰고 나면 같은 학생의 남은 인증(중복 스캔 등)은 모두 무효 */
  function invalidateOtherAuth(studentId: string) {
    for (const e of db.authEvents) if (e.studentId === studentId && !e.consumed) e.consumed = true;
  }

  const codeAttempts: Record<string, number[]> = {};
  function limitCodeAttempts(deviceId: string) {
    const t = now().getTime();
    const recent = (codeAttempts[deviceId] ?? []).filter((x) => t - x < 60_000);
    if (recent.length >= CODE_PER_MINUTE) throw new ApiError("RATE_LIMITED");
    recent.push(t);
    codeAttempts[deviceId] = recent;
  }

  // ---------- AI (mock) ----------
  const aiCalls: Record<string, number[]> = {};
  function rateLimit(studentId: string) {
    const t = now().getTime();
    const recent = (aiCalls[studentId] ?? []).filter((x) => t - x < 60_000);
    if (recent.length >= AI_PER_MINUTE) throw new ApiError("RATE_LIMITED");
    recent.push(t);
    aiCalls[studentId] = recent;
  }
  function knownNames() {
    return db.users.map((u) => u.name); // 학생 + 교사 이름
  }
  function socraticReply(s: LearningSession, text: string): string {
    const topic = `${s.goal.subject} ${s.goal.activities.map(activityLabel).join(", ")}`;
    if (/알려\s*줘|정답|답만|풀어\s*줘|대신|다\s*써|해\s*줘/.test(text)) {
      return `바로 답을 주기보다 같이 찾아볼게요. 지금 "${topic}"에서 어디까지 해 봤어요? 막힌 단계 하나만 골라서 말해 주면, 그 단계에 맞는 힌트를 줄게요.`;
    }
    if (/[?？]|왜|어떻게|뭐/.test(text)) {
      return "좋은 질문이에요. 답하려면 먼저 어떤 개념을 알아야 할까요? 교과서에서 관련 부분을 찾아 한 줄로 메모해 보고, 그 메모가 질문과 어떻게 이어지는지 말해 줄래요?";
    }
    return "방금 쓴 내용을 예시 하나로 확인해 볼까요? 내 말로 한 문장 설명을 남겨 두면, 나중에 돌아볼 때 무엇이 달라졌는지 보기 쉬워요.";
  }
  function grounded(e: LearningEntry): GroundedItem {
    const text = e.kind === "PAPER" ? "종이에 수기로 학습 기록" : e.content.length > 40 ? `${e.content.slice(0, 40)}…` : e.content;
    return { text, evidenceIds: [e.id] };
  }

  function aiAssess(s: LearningSession): CriterionScore[] {
    // 교사용 AI 채점: 교사가 볼 수 있는 범위(공개 기록 + 현재 공유 동의)만 근거로 쓴다
    const shared = sharedWithTeacher(s.studentId);
    const pub = teacherEntries(s);
    const questions = pub.filter((e) => e.kind === "QUESTION");
    const refl = shared ? db.reflections.find((r) => r.sessionId === s.id) : undefined;
    const msgs = shared ? db.aiMessages.filter((m) => m.sessionId === s.id && m.role === "student") : [];
    const none = (criterionId: string): CriterionScore => ({
      criterionId,
      level: null,
      reason: "판단할 근거 기록이 없어요. 교사 관찰로 판단해 주세요.",
      evidenceIds: [],
    });
    return [
      {
        criterionId: "planning",
        level: s.goal.activities.length >= 2 || s.goal.note ? 2 : 1,
        reason: `목표: ${s.goal.subject} / ${s.goal.activities.map(activityLabel).join(", ")}${s.goal.note ? " (메모 있음)" : ""}`,
        evidenceIds: ["goal"],
      },
      questions.length === 0
        ? none("questioning")
        : {
            criterionId: "questioning",
            level: questions.length >= 2 ? 2 : 1,
            reason: `질문 기록 ${questions.length}개`,
            evidenceIds: questions.map((q) => q.id),
          },
      !refl
        ? none("reflection")
        : {
            criterionId: "reflection",
            level: refl.checks.length >= 4 ? 2 : refl.checks.length >= 2 ? 1 : 0,
            reason: `성찰 체크 ${refl.checks.length}개, 이해도 ${refl.understanding}/3`,
            evidenceIds: ["reflection"],
          },
      msgs.length === 0
        ? none("ai_use")
        : {
            criterionId: "ai_use",
            level: refl?.checks.includes("ai_checked") ? 2 : 1,
            reason: `AI에 ${msgs.length}번 질문${refl?.checks.includes("ai_checked") ? ", AI 답을 확인했다고 체크" : ""}`,
            evidenceIds: msgs.map((m) => m.id),
          },
    ];
  }

  /** 채점 대상: 학생 신고·교사 제외 확정이 아닌 문항 */
  function isScored(i: { reported: boolean; excluded?: boolean }) {
    return !i.reported && !i.excluded;
  }
  function rescore(a: QuizAttempt) {
    const scored = a.items.filter(isScored);
    a.total = scored.length;
    a.correct = scored.filter((i) => i.correct).length;
  }

  // ---------- 주제 사전 ----------
  /** 반 주제 사전에서 같은 개념(사전 key)의 주제를 찾고, 없으면 만든다 → 이름이 쪼개지지 않음 */
  function classTopic(classId: string, dict: DictionaryTopic) {
    let t = db.topics.find((x) => x.classId === classId && x.key === dict.key);
    if (!t) {
      t = { id: id("topic"), classId, key: dict.key, name: dict.name, subject: dict.subject };
      db.topics.push(t);
    }
    return t;
  }

  // ---------- 주제 테스트 ----------
  /** 학생 본인 세션 확인 (남의 세션이면 존재를 숨김) */
  function ownSession(sessionId: string) {
    const u = me();
    const s = visibleSession(sessionId);
    if (u.role !== "student" || s.studentId !== u.id) throw new ApiError("NOT_FOUND");
    return s;
  }

  /**
   * 처음 출제할 때 문항을 스냅샷으로 고정한다.
   * - 이번 세션에서 추출된 주제만, ENDED 세션만
   * - 반 문항 풀(제외되지 않은 것)에서 개념 3 + 적용 2를 세션 기준으로 결정적 선택 → 학생과 무관한 고정 난이도
   * - 객관식 선택지는 세션 기준으로 섞고 정답 번호 보정 (O/X는 고정)
   */
  function servedQuiz(sessionId: string, topicId?: string) {
    const s = ownSession(sessionId);
    if (s.status !== "ENDED") throw new ApiError("QUIZ_NOT_AVAILABLE");
    const existing = db.quizServes[sessionId];
    if (existing) {
      if (topicId && existing.topicId !== topicId) throw new ApiError("QUIZ_NOT_AVAILABLE");
      const topic = db.topics.find((t) => t.id === existing.topicId)!;
      return { s, topic, questions: existing.questions };
    }
    const st = (db.sessionTopics[sessionId] ?? []).find((t) => t.topicId === topicId);
    const topic = st ? db.topics.find((t) => t.id === st.topicId) : undefined;
    if (!topic) throw new ApiError("QUIZ_NOT_AVAILABLE");
    const pool = db.topicQuestions.filter((x) => x.topicId === topic.id && !x.excluded);
    const pick = (level: "CONCEPT" | "APPLY", n: number) =>
      pool
        .filter((x) => x.level === level)
        .sort((a, b) => hash(sessionId + a.id) - hash(sessionId + b.id))
        .slice(0, n);
    // 실서비스: 풀이 모자라면 LLM이 고정 난이도로 부족분만 생성해 풀에 추가 (명세 v0.5)
    const chosen = [...pick("CONCEPT", QUIZ_CONCEPT), ...pick("APPLY", QUIZ_APPLY)];
    const snap: ServedQuestion[] = chosen.map((x) => {
      if (x.type === "OX") return { id: x.id, type: x.type, prompt: x.prompt, choices: [...x.choices], answerIndex: x.answerIndex, explanation: x.explanation, reported: false };
      const order = x.choices.map((_, i) => i).sort((a, b) => hash(`${sessionId}:${x.id}:${a}`) - hash(`${sessionId}:${x.id}:${b}`));
      return { id: x.id, type: x.type, prompt: x.prompt, choices: order.map((i) => x.choices[i]), answerIndex: order.indexOf(x.answerIndex), explanation: x.explanation, reported: false };
    });
    db.quizServes[sessionId] = { topicId: topic.id, questions: snap };
    return { s, topic, questions: snap };
  }

  /** 학생의 최근 응시 (topicId 없으면 전체 주제 중 최근) */
  function lastAttempt(studentId: string, topicId?: string): QuizAttempt | null {
    const list = db.quizAttempts
      .filter((a) => a.studentId === studentId && (!topicId || a.topicId === topicId) && a.total > 0)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return list[0] ?? null;
  }
  /** 차이 신호: 스스로 '설명할 수 있다(3)'인데 60% 미만 → OVERCONFIDENT, 그 외 40% 미만 → LOW_SCORE */
  function quizSignal(rate: number | null, understanding: number | null, total = SIGNAL_MIN_TOTAL): TopicGrowth["signal"] {
    if (rate === null || total < SIGNAL_MIN_TOTAL) return null; // 신고로 채점 문항이 너무 적으면 판단하지 않음
    if (understanding === 3 && rate < 0.6) return "OVERCONFIDENT";
    if (rate < 0.4) return "LOW_SCORE";
    return null;
  }
  function lastQuizRate(studentId: string, topicId?: string): number | null {
    const a = lastAttempt(studentId, topicId);
    return a ? a.correct / a.total : null;
  }

  function studentView(a: Assessment): Assessment {
    // 학생은 교사 확정본만 본다
    return a.teacher ? { ...a, ai: null } : { ...a, ai: null, teacher: null };
  }

  // ---------- Api ----------
  const api: Api = {
    listDemoUsers: () =>
      run(() => db.users.filter((u) => u.classId === "c1" || u.id === "t2")),

    login: (userId) =>
      run(() => {
        const u = userById(userId);
        if (!u) throw new ApiError("NOT_FOUND");
        currentUserId = u.id;
        writeSessionUser(u.id);
        return u;
      }),

    signIn: () =>
      run(() => {
        throw new ApiError("FORBIDDEN", "데모 모드에서는 계정을 골라 들어가요");
      }),

    logout: () =>
      run(() => {
        currentUserId = null;
        writeSessionUser(null);
      }),

    me: () => run(() => db.users.find((u) => u.id === currentUserId) ?? null),

    getConsents: () =>
      run(() => {
        const u = me();
        return currentConsents(u.id);
      }),

    saveConsents: (input) =>
      run(() => {
        const u = me();
        if (u.role !== "student") throw new ApiError("FORBIDDEN");
        // 만 14세 미만은 보호자 동의 없이 '동의'를 저장할 수 없다 (서버에서 강제)
        if (u.under14 && input.some((c) => c.granted && !c.byGuardian)) throw new ApiError("GUARDIAN_CONSENT_REQUIRED");
        const list: Consent[] = input.map((c) => ({
          kind: c.kind,
          granted: c.granted,
          byGuardian: c.byGuardian,
          policyVersion: POLICY_VERSION,
          createdAt: iso(),
        }));
        // 덮어쓰지 않고 이력으로 쌓는다
        db.consents[u.id] = [...(db.consents[u.id] ?? []), ...list];
        audit("CONSENT_CHANGE", u.id);
        return currentConsents(u.id);
      }),

    listStudents: (classId) =>
      run(() => {
        const u = teacher(); // 학생은 반 명단을 볼 수 없다
        if (u.classId !== classId) throw new ApiError("NOT_FOUND");
        return db.users
          .filter((x) => x.role === "student" && x.classId === classId)
          .map((x) => ({ id: x.id, name: x.name, classId: x.classId, number: x.number ?? 0 }));
      }),

    submitFaceAuth: (deviceId, raw) =>
      run(() => {
        const studentId = raw.merchantUserKey ? db.facepassLinks[raw.merchantUserKey] ?? null : null;
        const ok =
          raw.authenticated &&
          raw.result === "Authenticated" &&
          !!studentId &&
          hasConsent(studentId, "FACEPASS");
        return recordAuth(deviceId, studentId, "FACEPASS", ok);
      }),

    issueQrToken: () =>
      run(() => {
        const u = me();
        if (u.role !== "student") throw new ApiError("FORBIDDEN");
        const token = `QR${randomToken()}`;
        const expiresAt = new Date(now().getTime() + QR_TTL_MS).toISOString();
        db.qrTokens[token] = { studentId: u.id, expiresAt, used: false };
        return { token, expiresAt };
      }),

    submitCodeAuth: (deviceId, method, token) =>
      run(() => {
        limitCodeAttempts(deviceId);
        const key = token.trim();
        let studentId: string | null = null;
        if (method === "QR") {
          const q = db.qrTokens[key];
          // 1회용 + 60초
          if (q && !q.used && now().getTime() <= new Date(q.expiresAt).getTime()) {
            q.used = true;
            studentId = q.studentId;
          }
        } else {
          // 학생증 바코드: 고정값이라 재사용 가능 → 기록에 '바코드'로 남아 교사가 구분
          studentId = db.barcodes[key] ?? null;
        }
        return recordAuth(deviceId, studentId, method, !!studentId);
      }),

    submitManualAuth: (studentId) =>
      run(() => {
        const t = teacher();
        if (userById(studentId)?.classId !== t.classId) throw new ApiError("NOT_FOUND");
        audit("MANUAL_AUTH", studentId);
        return recordAuth(`teacher:${t.id}`, studentId, "MANUAL", true);
      }),

    getPendingAuthEvent: () =>
      run(() => {
        const u = me();
        const t = now().getTime();
        const list = db.authEvents.filter(
          (e) =>
            e.studentId === u.id &&
            e.success &&
            !e.consumed &&
            t - new Date(e.verifiedAt).getTime() <= AUTH_EVENT_TTL_MS,
        );
        return list[list.length - 1] ?? null;
      }),

    simulateFaceAuth: (deviceId, studentId, success) =>
      run(() => {
        // 개발·데모 전용. 실제 서버에선 ALLOW_DEV_SIMULATE일 때만 존재
        return recordAuth(deviceId, studentId, "FACEPASS", success && hasConsent(studentId, "FACEPASS"));
      }),

    getActiveSession: () =>
      run(() => {
        const u = me();
        return db.sessions.find((s) => s.studentId === u.id && s.status === "ACTIVE") ?? null;
      }),

    startSession: ({ goal, authEventId }) =>
      run(() => {
        const u = me();
        if (u.role !== "student") throw new ApiError("FORBIDDEN");
        if (!goal.subject.trim() || goal.subject.length > 200) throw new ApiError("VALIDATION"); // "오늘 할 것" 필수, 활동 체크는 선택
        if (db.sessions.some((s) => s.studentId === u.id && s.status === "ACTIVE")) {
          throw new ApiError("SESSION_ALREADY_ACTIVE");
        }
        const ev = consumeAuth(authEventId, u.id);
        invalidateOtherAuth(u.id);
        const s: LearningSession = {
          id: id("sess"),
          studentId: u.id,
          goal: {
            subject: goal.subject,
            activities: [...goal.activities],
            note: goal.note?.trim() || undefined,
          },
          startedAt: ev.verifiedAt,
          endedAt: null,
          startAuth: ev.method,
          endAuth: null,
          status: "ACTIVE",
          durationMinutes: null,
        };
        db.sessions.push(s);
        return s;
      }),

    endSession: (sessionId, authEventId) =>
      run(() => {
        const u = me();
        const s = visibleSession(sessionId);
        if (s.studentId !== u.id) throw new ApiError("FORBIDDEN");
        if (s.status === "ENDED") throw new ApiError("SESSION_ALREADY_ENDED");
        const ev = consumeAuth(authEventId, u.id, s.startedAt);
        invalidateOtherAuth(u.id);
        s.endedAt = ev.verifiedAt;
        s.endAuth = ev.method;
        s.status = "ENDED";
        s.durationMinutes = minutesBetween(s.startedAt, ev.verifiedAt);
        return s;
      }),

    getSession: (sessionId) =>
      run(() => {
        const s = visibleSession(sessionId);
        if (me().role === "teacher") audit("VIEW_SESSION", s.studentId);
        return s;
      }),

    listSessions: ({ studentId }) =>
      run(() => {
        const u = me();
        const target = u.role === "student" ? u.id : studentId;
        if (!target) throw new ApiError("VALIDATION");
        if (u.role === "teacher") {
          if (userById(target)?.classId !== u.classId) throw new ApiError("NOT_FOUND");
          audit("VIEW_STUDENT_DETAIL", target);
        }
        return db.sessions
          .filter((s) => s.studentId === target)
          .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
      }),

    addEntry: ({ sessionId, kind, content, visibility }) =>
      run(() => {
        const s = ownActiveSession(sessionId);
        const text = content.trim();
        if (text.length > MAX_ENTRY) throw new ApiError("VALIDATION");
        if (kind !== "PAPER" && text.length === 0) throw new ApiError("VALIDATION");
        // 기록 공유 미동의 학생은 서버가 PRIVATE으로 강제
        const vis = hasConsent(s.studentId, "LEARNING_RECORD") ? visibility : "PRIVATE";
        const e: LearningEntry = { id: id("entry"), sessionId, kind, content: text, visibility: vis, createdAt: iso() };
        db.entries.push(e);
        return e;
      }),

    listEntries: (sessionId) =>
      run(() => {
        const s = visibleSession(sessionId);
        const list = isTeacherView() ? teacherEntries(s) : db.entries.filter((e) => e.sessionId === sessionId);
        return [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      }),

    listAiMessages: (sessionId) =>
      run(() => {
        const s = visibleSession(sessionId);
        if (isTeacherView() && !sharedWithTeacher(s.studentId)) return [];
        return db.aiMessages.filter((m) => m.sessionId === sessionId);
      }),

    askAi: (sessionId, content) =>
      run(() => {
        const s = ownActiveSession(sessionId);
        if (!hasConsent(s.studentId, "AI")) throw new ApiError("CONSENT_REQUIRED");
        const text = content.trim();
        if (!text || text.length > MAX_AI_INPUT) throw new ApiError("VALIDATION");
        rateLimit(s.studentId);
        const masked = maskPii(text, knownNames());
        // 실제 서버: 이 값만 LLM으로 전송 (이름·ID 없음)
        opts.onAiPayload?.(masked);
        // 저장도 마스킹된 값으로 (교사 타임라인·로그에 원문 개인정보가 남지 않게)
        const studentMsg: AiMessage = { id: id("ai"), sessionId, role: "student", content: masked, createdAt: iso() };
        const aiMsg: AiMessage = { id: id("ai"), sessionId, role: "ai", content: socraticReply(s, masked), createdAt: iso() };
        db.aiMessages.push(studentMsg, aiMsg);
        return aiMsg;
      }),

    summarizeSession: (sessionId) =>
      run(() => {
        const s = visibleSession(sessionId);
        // 요약도 기록을 AI로 보내므로 학생의 AI 동의가 있어야 함 (서버 4-1과 같은 규칙, 교사 요청 포함)
        if (!hasConsent(s.studentId, "AI")) throw new ApiError("CONSENT_REQUIRED");
        const pub = isTeacherView() ? teacherEntries(s) : publicEntries(sessionId);
        return {
          activities: pub.filter((e) => e.kind !== "QUESTION").map(grounded),
          remainingQuestions: pub.filter((e) => e.kind === "QUESTION").map(grounded),
        };
      }),

    getReflection: (sessionId) =>
      run(() => {
        const s = visibleSession(sessionId);
        if (isTeacherView() && !sharedWithTeacher(s.studentId)) return null;
        return db.reflections.find((r) => r.sessionId === sessionId) ?? null;
      }),

    saveReflection: (r) =>
      run(() => {
        const u = me();
        const s = visibleSession(r.sessionId);
        if (s.studentId !== u.id) throw new ApiError("FORBIDDEN");
        const saved = {
          sessionId: r.sessionId,
          checks: [...new Set(r.checks)],
          understanding: r.understanding,
          remainingQuestions: r.remainingQuestions.map((q) => q.trim()).filter(Boolean).slice(0, 5),
          note: r.note?.trim() || undefined,
          updatedAt: iso(),
        };
        db.reflections = db.reflections.filter((x) => x.sessionId !== r.sessionId).concat(saved);
        return saved;
      }),

    listFeedback: (sessionId) =>
      run(() => {
        visibleSession(sessionId);
        return db.feedback.filter((f) => f.sessionId === sessionId);
      }),

    addFeedback: (sessionId, content) =>
      run(() => {
        const t = teacher();
        visibleSession(sessionId);
        const text = content.trim();
        if (!text || text.length > MAX_ENTRY) throw new ApiError("VALIDATION");
        const f = { id: id("fb"), sessionId, teacherId: t.id, content: text, createdAt: iso() };
        db.feedback.push(f);
        return f;
      }),

    getDashboard: (classId) =>
      run(() => {
        const t = teacher();
        if (t.classId !== classId) throw new ApiError("NOT_FOUND");
        const to = now();
        const from = new Date(to.getTime() - 7 * 86400000);
        const rows: DashboardRow[] = db.users
          .filter((u) => u.role === "student" && u.classId === classId)
          .map((u) => {
            const mine = db.sessions.filter((s) => s.studentId === u.id);
            const inRange = mine.filter((s) => new Date(s.startedAt) >= from);
            // 공유 동의가 없으면 성찰 내용(남은 질문 수)도 집계하지 않는다
            const openQ = sharedWithTeacher(u.id)
              ? inRange.reduce(
                  (n, s) => n + (db.reflections.find((r) => r.sessionId === s.id)?.remainingQuestions.length ?? 0),
                  0,
                )
              : 0;
            const last = [...mine].sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
            const pending = inRange.filter(
              (s) => s.status === "ENDED" && !db.assessments.find((a) => a.sessionId === s.id && a.finalizedAt),
            ).length;
            return {
              studentId: u.id,
              name: u.name,
              number: u.number ?? 0,
              sessionCount: inRange.length,
              totalMinutes: inRange.reduce((n, s) => n + (s.durationMinutes ?? 0), 0),
              openQuestionCount: openQ,
              lastSessionAt: last?.startedAt ?? null,
              needsAttention: openQ >= 3 || inRange.length === 0,
              activeNow: mine.some((s) => s.status === "ACTIVE"),
              pendingAssessment: pending,
              lastQuizRate: sharedWithTeacher(u.id) ? lastQuizRate(u.id) : null,
            };
          })
          .sort((a, b) => a.number - b.number);
        return { classId, from: from.toISOString(), to: to.toISOString(), students: rows };
      }),

    // ---------- 주제 추출 (mock AI: 키워드 사전) ----------
    extractTopics: (sessionId) =>
      run(() => {
        const u = me();
        const s = visibleSession(sessionId);
        if (u.role !== "student" || s.studentId !== u.id) throw new ApiError("NOT_FOUND");
        if (s.status !== "ENDED") throw new ApiError("SESSION_NOT_ACTIVE");
        // 주제 추출·문항 생성은 기록을 AI(외부 LLM)로 보내므로 AI 동의가 있어야 함
        if (!hasConsent(s.studentId, "AI")) throw new ApiError("CONSENT_REQUIRED");
        const cached = db.sessionTopics[sessionId];
        if (cached) return cached;
        // 근거: 교사 공개 기록만 (PRIVATE은 AI·교사 모두 보지 않음)
        const evidence = publicEntries(sessionId).filter((e) => e.content.trim());
        const found = TOPIC_DICTIONARY.map((dict) => {
          const ids = evidence.filter((e) => keywordHits(e.content, dict) > 0).map((e) => e.id);
          const hits = evidence.reduce((n, e) => n + keywordHits(e.content, dict), 0);
          return { dict, ids, hits };
        })
          .filter((x) => x.ids.length > 0) // 근거 없는 주제는 만들지 않음
          .sort((a, b) => b.hits - a.hits)
          .slice(0, TOPICS_MAX);
        const result: SessionTopic[] = found.map(({ dict, ids }) => {
          const topic = classTopic(u.classId, dict);
          return { topicId: topic.id, name: topic.name, subject: topic.subject, evidenceIds: ids };
        });
        db.sessionTopics[sessionId] = result;
        return result;
      }),

    // ---------- 주제 테스트 ----------
    getQuiz: (sessionId, topicId) =>
      run(() => {
        const { topic, questions } = servedQuiz(sessionId, topicId);
        // 정답·해설은 내려주지 않는다 (채점은 서버)
        const safe: StudentQuizQuestion[] = questions.map((x) => ({ id: x.id, type: x.type, prompt: x.prompt, choices: [...x.choices], reported: x.reported }));
        return { topic: { id: topic.id, name: topic.name }, questions: safe };
      }),

    reportQuestion: (sessionId, questionId, reason) =>
      run(() => {
        const s = ownSession(sessionId);
        if (db.quizAttempts.some((a) => a.sessionId === sessionId)) throw new ApiError("QUIZ_ALREADY_TAKEN");
        const serve = db.quizServes[sessionId];
        const q = serve?.questions.find((x) => x.id === questionId);
        if (!serve || !q) throw new ApiError("NOT_FOUND");
        if (!["WRONG_ANSWER", "UNCLEAR", "UNRELATED"].includes(reason)) throw new ApiError("VALIDATION");
        if (q.reported) return;
        q.reported = true;
        db.quizReports.push({ id: id("report"), sessionId, questionId, studentId: s.studentId, classId: me().classId, reason, status: "OPEN", createdAt: iso() });
      }),

    submitQuiz: (sessionId, answers) =>
      run(() => {
        if (db.quizAttempts.some((a) => a.sessionId === sessionId)) {
          ownSession(sessionId); // 남의 세션이면 NOT_FOUND가 먼저
          throw new ApiError("QUIZ_ALREADY_TAKEN");
        }
        // 학생이 받은 출제 스냅샷 그대로 채점 (getQuiz 없이 제출하면 출제 대상 없음)
        if (!db.quizServes[sessionId]) {
          ownSession(sessionId);
          throw new ApiError("QUIZ_NOT_AVAILABLE");
        }
        const { s, topic, questions } = servedQuiz(sessionId);
        const items = questions.map((x) => {
          const raw = answers[x.id];
          const chosen = Number.isInteger(raw) && (raw as number) >= 0 && (raw as number) < x.choices.length ? (raw as number) : null;
          return { questionId: x.id, prompt: x.prompt, choices: [...x.choices], chosen, answerIndex: x.answerIndex, correct: chosen === x.answerIndex, explanation: x.explanation, reported: x.reported, excluded: x.excluded };
        });
        const scored = items.filter(isScored); // 신고·제외 확정 문항은 채점 제외
        const attempt: QuizAttempt = {
          id: id("quiz"),
          sessionId,
          topicId: topic.id,
          studentId: s.studentId,
          correct: scored.filter((i) => i.correct).length,
          total: scored.length,
          createdAt: iso(),
          items,
        };
        db.quizAttempts.push(attempt);
        return attempt;
      }),

    getQuizAttempt: (sessionId) =>
      run(() => {
        const s = visibleSession(sessionId);
        if (isTeacherView() && !sharedWithTeacher(s.studentId)) return null;
        return db.quizAttempts.find((a) => a.sessionId === sessionId) ?? null;
      }),

    // ---------- 주제별 성장·신고 문제 ----------
    getTopicGrowth: (studentId) =>
      run(() => {
        const u = me();
        const target = userById(studentId);
        const allowed = u.role === "student" ? u.id === studentId : target?.classId === u.classId && target.role === "student";
        if (!allowed) throw new ApiError("NOT_FOUND");
        if (u.role === "teacher") audit("VIEW_TOPIC_GROWTH", studentId);
        const mine = db.sessions.filter((x) => x.studentId === studentId);
        const minutesOf = (list: LearningSession[]) => list.reduce((n, x) => n + (x.durationMinutes ?? 0), 0);
        const total = { sessions: mine.length, minutes: minutesOf(mine) };
        // 공유 미동의 학생을 교사가 보면: 주제 이름도 기록 내용이므로 숨기고 전체 횟수·시간만
        if (u.role === "teacher" && !sharedWithTeacher(studentId)) return { studentId, shared: false, topics: [], total };
        const topicIds = [...new Set(mine.flatMap((x) => (db.sessionTopics[x.id] ?? []).map((t) => t.topicId)))];
        const topics: TopicGrowth[] = topicIds.map((topicId) => {
          const topic = db.topics.find((t) => t.id === topicId)!;
          const list = mine.filter((x) => (db.sessionTopics[x.id] ?? []).some((t) => t.topicId === topicId));
          const attempts = db.quizAttempts
            .filter((a) => a.studentId === studentId && a.topicId === topicId && a.total > 0)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          const rate = (a?: QuizAttempt) => (a ? a.correct / a.total : null);
          const last = attempts[attempts.length - 1];
          const lastEnded = [...list].filter((x) => x.status === "ENDED").sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
          const und = lastEnded ? (db.reflections.find((r) => r.sessionId === lastEnded.id)?.understanding ?? null) : null;
          // 신호는 같은 세션의 응시 결과와 이해도 짝으로만
          const pairedUnd = last ? (db.reflections.find((r) => r.sessionId === last.sessionId)?.understanding ?? null) : null;
          return {
            topicId,
            name: topic.name,
            subject: topic.subject,
            sessions: list.length,
            minutes: minutesOf(list),
            attempts: attempts.length,
            firstRate: rate(attempts[0]),
            lastRate: rate(last),
            lastTotal: last ? last.total : null,
            lastUnderstanding: und,
            signal: quizSignal(rate(last), pairedUnd, last ? last.total : 0),
          };
        });
        topics.sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name));
        return { studentId, shared: true, topics, total };
      }),

    listReportedQuestions: (classId) =>
      run(() => {
        const t = teacher();
        if (t.classId !== classId) throw new ApiError("NOT_FOUND");
        const reports = db.quizReports.filter((r) => r.classId === classId);
        return reports
          .map((r): ReportedQuestion => {
            const q = db.topicQuestions.find((x) => x.id === r.questionId)!;
            const topic = db.topics.find((x) => x.id === q.topicId);
            return {
              reportId: r.id,
              topicName: topic?.name ?? "",
              prompt: q.prompt,
              choices: [...q.choices],
              answerIndex: q.answerIndex,
              explanation: q.explanation,
              reason: r.reason,
              status: r.status,
              // 기록 공유 미동의 학생은 누가 어떤 주제를 공부했는지 드러나지 않게 익명
              studentNumber: sharedWithTeacher(r.studentId) ? (userById(r.studentId)?.number ?? 0) : null,
              studentReportCount: sharedWithTeacher(r.studentId) ? reports.filter((x) => x.studentId === r.studentId).length : null,
              createdAt: r.createdAt,
            };
          })
          .sort((a, b) => (a.status === "OPEN" ? 0 : 1) - (b.status === "OPEN" ? 0 : 1) || b.createdAt.localeCompare(a.createdAt));
      }),

    resolveReport: (reportId, action) =>
      run(() => {
        const t = teacher();
        const r = db.quizReports.find((x) => x.id === reportId);
        if (!r || r.classId !== t.classId) throw new ApiError("NOT_FOUND");
        if (action !== "KEEP_EXCLUDED" && action !== "DISMISS") throw new ApiError("VALIDATION");
        r.status = action === "KEEP_EXCLUDED" ? "KEEP_EXCLUDED" : "DISMISSED";
        if (action === "KEEP_EXCLUDED") {
          const q = db.topicQuestions.find((x) => x.id === r.questionId);
          if (q) q.excluded = true; // 다음 출제부터 빠짐
          // 이미 이 문항을 받은 모든 출제·응시에서도 채점 제외 (신고하지 않은 학생 포함)
          for (const serve of Object.values(db.quizServes)) {
            for (const sq of serve.questions) if (sq.id === r.questionId) sq.excluded = true;
          }
          for (const a of db.quizAttempts) {
            if (!a.items.some((i) => i.questionId === r.questionId)) continue;
            for (const i of a.items) if (i.questionId === r.questionId) i.excluded = true;
            rescore(a);
          }
        } else {
          // 기각: 출제 스냅샷의 신고 표시를 풀고, 이미 제출했으면 재채점
          const serve = db.quizServes[r.sessionId];
          const sq = serve?.questions.find((x) => x.id === r.questionId);
          if (sq) sq.reported = false;
          const attempt = db.quizAttempts.find((a) => a.sessionId === r.sessionId);
          if (attempt) {
            const item = attempt.items.find((i) => i.questionId === r.questionId);
            if (item) item.reported = false;
            rescore(attempt);
          }
        }
        audit(action === "KEEP_EXCLUDED" ? "REPORT_KEEP_EXCLUDED" : "REPORT_DISMISS", r.studentId);
      }),

    getRubric: (classId) =>
      run(() => {
        const u = me();
        if (u.classId !== classId) throw new ApiError("NOT_FOUND");
        const r = db.rubrics.find((x) => x.classId === classId);
        if (!r) throw new ApiError("NOT_FOUND");
        return r;
      }),

    getAssessment: (sessionId) =>
      run(() => {
        const u = me();
        visibleSession(sessionId);
        const a = db.assessments.find((x) => x.sessionId === sessionId) ?? null;
        if (!a) return null;
        return u.role === "student" ? studentView(a) : a;
      }),

    requestAiAssessment: (sessionId) =>
      run(() => {
        const t = teacher();
        const s = visibleSession(sessionId);
        if (s.status !== "ENDED") throw new ApiError("SESSION_NOT_ACTIVE", "끝난 학습만 채점할 수 있어요");
        const rubric = db.rubrics.find((r) => r.classId === t.classId);
        if (!rubric) throw new ApiError("NOT_FOUND");
        const ai = aiAssess(s).filter((c) => rubric.criteria.some((k) => k.id === c.criterionId));
        const existing = db.assessments.find((a) => a.sessionId === sessionId);
        if (existing) {
          existing.ai = ai;
          return existing;
        }
        const a: Assessment = { sessionId, rubricId: rubric.id, ai, teacher: null, finalizedAt: null };
        db.assessments.push(a);
        return a;
      }),

    finalizeAssessment: (sessionId, scores) =>
      run(() => {
        const t = teacher();
        const target = visibleSession(sessionId);
        if (target.status !== "ENDED") throw new ApiError("SESSION_NOT_ACTIVE", "끝난 학습만 평가를 확정할 수 있어요");
        const rubric = db.rubrics.find((r) => r.classId === t.classId);
        if (!rubric) throw new ApiError("NOT_FOUND");
        for (const sc of scores) {
          const c = rubric.criteria.find((k) => k.id === sc.criterionId);
          if (!c || (sc.level !== null && (sc.level < 0 || sc.level >= c.levels.length))) {
            throw new ApiError("VALIDATION");
          }
        }
        let a = db.assessments.find((x) => x.sessionId === sessionId);
        if (!a) {
          a = { sessionId, rubricId: rubric.id, ai: null, teacher: null, finalizedAt: null };
          db.assessments.push(a);
        }
        a.teacher = scores;
        a.finalizedAt = iso();
        audit("FINALIZE_ASSESSMENT", db.sessions.find((s) => s.id === sessionId)?.studentId ?? null);
        return a;
      }),
  };

  return api;
}

/** 문자열 → 32bit 정수 (FNV-1a). 출제 순서 섞기용, 보안 용도 아님 */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function randomToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}
