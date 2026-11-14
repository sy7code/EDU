import { describe, expect, it } from "vitest";
import {
  changedToReflection,
  realtimeStatus,
  goalToText,
  mapDashboard,
  mapFnError,
  mapPgError,
  reflectionToChanged,
  textToGoal,
  toGrounded,
  rowToReflection,
  latestConsents,
  pickQuizQuestions,
  rowToUser,
  consentRows,
  buildAnalyticsRaw,
  isShared,
  chunk,
  fetchAllPages,
  rowToFeedback,
  rowToAuditLog,
  toReportOutcome,
  normalizeReportedQuestion,
} from "./supabaseMappers";

describe("목표 ↔ 텍스트", () => {
  it("과목·활동·메모를 한 줄 텍스트로 만들고 다시 읽는다", () => {
    const goal = { subject: "수학", activities: ["concept", "problem"], note: "꼭짓점" };
    const text = goalToText(goal);
    expect(text).toBe("수학 | 개념 이해하기, 문제 풀기 | 꼭짓점");
    expect(textToGoal(text)).toEqual(goal);
  });

  it("백엔드의 자유 입력 목표는 그대로 보여 준다", () => {
    expect(textToGoal("이차함수 꼭짓점 이해하기")).toEqual({ subject: "이차함수 꼭짓점 이해하기", activities: [] });
  });

  it("200자를 넘지 않게 자른다", () => {
    expect(goalToText({ subject: "가".repeat(300), activities: [] }).length).toBe(200);
  });
});

describe("성찰 ↔ changed 텍스트", () => {
  it("체크리스트 성찰을 텍스트로 저장하고 다시 읽는다", () => {
    const r = { sessionId: "s1", checks: ["goal_done", "asked"], understanding: 2 as const, remainingQuestions: ["왜?"], note: "메모" };
    const changed = reflectionToChanged(r);
    expect(changed).toContain("세운 목표를 끝까지 했다");
    const back = changedToReflection("s1", changed, ["왜?"], "2026-11-14T00:00:00Z");
    expect(back).toMatchObject({ checks: ["goal_done", "asked"], understanding: 2, note: "메모", remainingQuestions: ["왜?"] });
  });

  it("예전 주관식 성찰은 이해도 없이 원문으로 보여 준다", () => {
    const back = changedToReflection("s1", "공식이 왜 나오는지 알게 됨", [], "2026-11-14T00:00:00Z");
    expect(back.understanding).toBeNull();
    expect(back.legacyText).toBe("공식이 왜 나오는지 알게 됨");
  });
});

describe("요약 근거", () => {
  it("문자열 항목은 근거 없이, 객체 항목은 그대로", () => {
    expect(toGrounded(["예제 풀이", { text: "질문", evidenceIds: ["e1"] }])).toEqual([
      { text: "예제 풀이", evidenceIds: [] },
      { text: "질문", evidenceIds: ["e1"] },
    ]);
  });
});

describe("대시보드 변환", () => {
  it("RPC 결과를 프론트 형식으로 바꾸고 없는 값은 기본값", () => {
    const d = mapDashboard(
      { classId: "c", from: "2026-11-08", to: "2026-11-14", students: [
        { studentId: "a", name: "학생01", number: 1, sessionCount: 2, totalMinutes: 90, openQuestionCount: 1, lastSessionAt: null, hasReflectionWithoutFeedback: true, needsAttention: false },
      ] },
      new Set(["a"]),
    );
    expect(d.students[0]).toMatchObject({ studentId: "a", activeNow: true, pendingAssessment: 0, lastQuizRate: null, sessionCount: 2 });
  });

  it("피드백 기다리는 돌아보기 여부를 넘기고, 값이 없으면 false", () => {
    const base = { studentId: "a", name: "학생01", number: 1, sessionCount: 1, totalMinutes: 30, openQuestionCount: 0, lastSessionAt: null, needsAttention: false };
    const d = mapDashboard(
      { classId: "c", from: "f", to: "t", students: [{ ...base, hasReflectionWithoutFeedback: true }, { ...base, studentId: "b" }] },
      new Set(),
    );
    expect(d.students.map((s) => s.hasReflectionWithoutFeedback)).toEqual([true, false]);
  });

  it("기록 공유는 shared === true일 때만 (없거나 이상한 값이면 비공개)", () => {
    const base = { studentId: "a", name: "학생01", number: 1, sessionCount: 1, totalMinutes: 30, openQuestionCount: 0, lastSessionAt: null, needsAttention: false };
    const d = mapDashboard(
      { classId: "c", from: "f", to: "t", students: [{ ...base, shared: true }, { ...base, shared: "true" }, { ...base }] },
      new Set(),
    );
    expect(d.students.map((s) => s.shared)).toEqual([true, false, false]);
  });
});

describe("에러 변환", () => {
  it("함수 에러 코드를 프론트 코드로 바꾼다", () => {
    expect(mapFnError(401, { error: { code: "UNAUTHORIZED", message: "x" } }).code).toBe("UNAUTHENTICATED");
    expect(mapFnError(409, { error: { code: "SESSION_ALREADY_ACTIVE", message: "x" } }).code).toBe("SESSION_ALREADY_ACTIVE");
    expect(mapFnError(400, { error: { code: "TOO_LONG", message: "x" } }).code).toBe("VALIDATION");
    expect(mapFnError(502, { error: { code: "AI_UNAVAILABLE", message: "x" } }).code).toBe("AI_TIMEOUT");
    expect(mapFnError(500, "not json").code).toBe("UNKNOWN");
  });

  it("테이블 쓰기 에러를 프론트 코드로 바꾼다", () => {
    expect(mapPgError({ message: "SESSION_NOT_ACTIVE" }).code).toBe("SESSION_NOT_ACTIVE");
    expect(mapPgError({ message: "new row violates row-level security policy for table \"entries\"" }).code).toBe("FORBIDDEN");
    expect(mapPgError({ message: "NOT_FOUND" }).code).toBe("NOT_FOUND");
  });
});

describe("수정본 백엔드 형식 (2026-11-14)", () => {
  it("테이블 쓰기 에러를 code로 구분한다", () => {
    expect(mapPgError({ code: "SESSION_NOT_ACTIVE", message: "진행 중인 학습에만 기록할 수 있어요." }).code).toBe("SESSION_NOT_ACTIVE");
    expect(mapPgError({ code: "NOT_FOUND", message: "찾을 수 없어요." }).code).toBe("NOT_FOUND");
    expect(mapPgError({ code: "42501", message: "new row violates row-level security policy" }).code).toBe("FORBIDDEN");
  });

  it("주제 테스트 함수 에러 코드를 바꾼다", () => {
    expect(mapFnError(409, { error: { code: "QUIZ_NOT_AVAILABLE", message: "x" } }).code).toBe("QUIZ_NOT_AVAILABLE");
    expect(mapFnError(409, { error: { code: "QUIZ_ALREADY_TAKEN", message: "x" } }).code).toBe("QUIZ_ALREADY_TAKEN");
    expect(mapFnError(502, { error: { code: "AI_BAD_OUTPUT", message: "x" } }).code).toBe("AI_BAD_OUTPUT");
  });

  it("성찰은 컬럼을 우선 읽고, 컬럼이 비면 예전 텍스트를 읽는다", () => {
    expect(rowToReflection({ sessionId: "s", changed: "", checks: ["asked"], understanding: 3, note: "메모", remainingQuestions: ["q"], updatedAt: "t" })).toMatchObject({
      checks: ["asked"],
      understanding: 3,
      note: "메모",
    });
    expect(rowToReflection({ sessionId: "s", changed: "예전 주관식", checks: [], understanding: null, note: null, remainingQuestions: [], updatedAt: "t" })).toMatchObject({
      understanding: null,
      legacyText: "예전 주관식",
    });
  });

  it("동의는 종류별 최신 행이 현재 값이다", () => {
    const c = latestConsents([
      { kind: "AI", granted: true, policyVersion: "v", createdAt: "2026-11-14T00:00:00Z" },
      { kind: "AI", granted: false, policyVersion: "v", createdAt: "2026-11-14T01:00:00Z" },
      { kind: "LEARNING_RECORD", granted: true, policyVersion: "v", createdAt: "2026-11-14T00:30:00Z" },
    ]);
    expect(c.find((x) => x.kind === "AI")?.granted).toBe(false);
    expect(c.length).toBe(2);
  });
});

describe("미룬 항목 수정 (변환)", () => {
  it("'오늘 할 것'에 구분자가 있어도 다시 읽을 때 깨지지 않는다", () => {
    const back = textToGoal(goalToText({ subject: "A | B 복습", activities: ["concept"] }));
    expect(back).toEqual({ subject: "A / B 복습", activities: ["concept"] });
  });

  it("200자를 넘으면 활동은 지키고 '오늘 할 것'을 줄인다", () => {
    const text = goalToText({ subject: "가".repeat(250), activities: ["concept", "problem"] });
    expect(Array.from(text).length).toBeLessThanOrEqual(200);
    expect(textToGoal(text).activities).toEqual(["concept", "problem"]);
  });

  it("서버 출제 응답에서 학생에게 필요한 필드만 남긴다", () => {
    const qs = pickQuizQuestions([{ id: "q1", type: "MCQ", prompt: "p", choices: ["a", "b"], answerIndex: 1, explanation: "e", reported: true }]);
    expect(qs).toEqual([{ id: "q1", type: "MCQ", prompt: "p", choices: ["a", "b"], reported: true }]);
  });

  it("v0.7: 이미 신고한 문항의 reportOutcome을 남기고, 모르는 review 값은 버린다", () => {
    const qs = pickQuizQuestions([
      { id: "q1", type: "MCQ", prompt: "p", choices: ["a"], reported: false, reportOutcome: { review: "AI_OK", message: "괜찮아요" } },
      { id: "q2", type: "OX", prompt: "p", choices: ["O", "X"], reportOutcome: { review: "HACK", message: "x" } },
      { id: "q3", type: "OX", prompt: "p", choices: ["O", "X"] },
    ]);
    expect(qs[0].reportOutcome).toEqual({ review: "AI_OK", message: "괜찮아요" });
    expect(qs[1].reportOutcome).toBeUndefined();
    expect(qs[2].reportOutcome).toBeUndefined();
  });
});

describe("목표 메모", () => {
  it("활동 없이 메모만 있어도 메모를 활동으로 읽지 않는다", () => {
    expect(textToGoal(goalToText({ subject: "복습", activities: [], note: "꼭짓점" }))).toEqual({ subject: "복습", activities: [], note: "꼭짓점" });
  });
});

describe("v0.5.1 백엔드 반영", () => {
  it("대시보드 lastQuizRate를 그대로 읽고 없으면 null", () => {
    const base = { name: "학생", number: 1, sessionCount: 0, totalMinutes: 0, openQuestionCount: 0, lastSessionAt: null, needsAttention: false };
    const d = mapDashboard({ classId: "c", from: "f", to: "t", students: [{ studentId: "a", ...base, lastQuizRate: 0.8 }, { studentId: "b", ...base, lastQuizRate: null }, { studentId: "c", ...base }] }, new Set());
    expect(d.students.map((s) => s.lastQuizRate)).toEqual([0.8, null, null]);
  });

  it("AI 미동의 함수 에러는 CONSENT_REQUIRED", () => {
    expect(mapFnError(403, { error: { code: "CONSENT_REQUIRED", message: "x" } }).code).toBe("CONSENT_REQUIRED");
  });

  it("만 14세 미만 보호자 동의 거부는 GUARDIAN_CONSENT_REQUIRED (함수·테이블 쓰기 모두)", () => {
    expect(mapFnError(403, { error: { code: "GUARDIAN_CONSENT_REQUIRED", message: "x" } }).code).toBe("GUARDIAN_CONSENT_REQUIRED");
    expect(mapPgError({ code: "GUARDIAN_CONSENT_REQUIRED", message: "보호자 동의가 필요해요." }).code).toBe("GUARDIAN_CONSENT_REQUIRED");
    expect(mapPgError({ code: "P0001", message: "GUARDIAN_CONSENT_REQUIRED" }).code).toBe("GUARDIAN_CONSENT_REQUIRED");
  });

  it("v_me의 under14를 읽는다", () => {
    expect(rowToUser({ id: "u", name: "학생30", role: "student", classId: "c", number: 30, under14: true }).under14).toBe(true);
    expect(rowToUser({ id: "u", name: "학생01", role: "student", classId: "c", number: 1 }).under14).toBe(false);
  });

  it("classId가 NULL이면 빈 문자열", () => {
    expect(rowToUser({ id: "t", name: "교과", role: "teacher", classId: null }).classId).toBe("");
    expect(rowToUser({ id: "t", name: "교과", role: "teacher" }).classId).toBe("");
  });

  it("동의 저장 행에 by_guardian을 넣는다", () => {
    expect(consentRows("s", "v1", [{ kind: "AI", granted: true, byGuardian: true }])).toEqual([
      { student_id: "s", kind: "AI", granted: true, by_guardian: true, policy_version: "v1" },
    ]);
  });
});

describe("반 분석 원자료 변환", () => {
  const sess = (id: string, studentId: string) => ({ id, studentId, goal: { subject: "수학", activities: [] }, startedAt: "2026-11-10T10:00:00Z", endedAt: null, startAuth: "FACEPASS" as const, endAuth: null, status: "ACTIVE" as const, durationMinutes: null });
  const input = {
    classId: "c", from: "f", to: "t",
    students: [
      { studentId: "a", name: "학생01", number: 1, shared: true },
      { studentId: "h", name: "학생03", number: 3, shared: false },
    ],
    sessions: [sess("sa", "a"), sess("sh", "h")],
    aiRows: [
      { id: "m1", sessionId: "sa", role: "user", content: "왜 그래?", createdAt: "x" },
      { id: "m2", sessionId: "sa", role: "ai", content: "좋은 질문", createdAt: "y" },
      { id: "m3", sessionId: "sh", role: "user", content: "답 알려줘", createdAt: "z" },
    ],
    attemptRows: [
      { sessionId: "sa", studentId: "a", topicId: "t1", correct: 4, total: 5, createdAt: "c" },
      { sessionId: "sh", studentId: "h", topicId: "t1", correct: 1, total: 5, createdAt: "c" },
    ],
    topicRows: [
      { sessionId: "sa", topicId: "t1", name: "꼭짓점" },
      { sessionId: "sh", topicId: "t1", name: "꼭짓점" },
    ],
  };

  it("학생 질문만 세션 주인과 함께 넣는다 (AI 답 제외)", () => {
    expect(buildAnalyticsRaw(input).questions).toEqual([{ id: "m1", sessionId: "sa", studentId: "a", content: "왜 그래?", createdAt: "x", questionType: null }]);
  });

  it("기록 공유 미동의 학생의 응시·주제는 뺀다", () => {
    const r = buildAnalyticsRaw(input);
    expect(r.attempts).toEqual([{ sessionId: "sa", studentId: "a", topicId: "t1", correct: 4, total: 5, createdAt: "c" }]);
    expect(r.sessionTopics).toEqual([{ sessionId: "sa", topicId: "t1", name: "꼭짓점" }]);
    expect(r.sessions.length).toBe(2);
  });
});

describe("반 분석 최종 리뷰 수정", () => {
  it("공유 여부는 shared === true 일 때만 공유 (I4)", () => {
    expect(isShared(true)).toBe(true);
    expect(isShared(false)).toBe(false);
    expect(isShared(null)).toBe(false);
    expect(isShared(undefined)).toBe(false);
  });

  it("서버 질문 유형(questionType)을 넘기고 이상한 값은 null (5-2)", () => {
    const r = buildAnalyticsRaw({
      classId: "c", from: "f", to: "t",
      students: [{ studentId: "a", name: "학생01", number: 1, shared: true }],
      sessions: [{ id: "sa", studentId: "a", goal: { subject: "수학", activities: [] }, startedAt: "x", endedAt: null, startAuth: "FACEPASS", endAuth: null, status: "ACTIVE", durationMinutes: null }],
      aiRows: [
        { id: "m1", sessionId: "sa", role: "user", content: "왜?", questionType: "ANSWER", createdAt: "x" },
        { id: "m2", sessionId: "sa", role: "user", content: "왜?", questionType: "WEIRD", createdAt: "x" },
      ],
      attemptRows: [], topicRows: [],
    });
    expect(r.questions.map((q) => q.questionType)).toEqual(["ANSWER", null]);
  });

  it("세션 id 목록을 100개씩 나눈다 (I2)", () => {
    const ids = Array.from({ length: 250 }, (_, i) => String(i));
    expect(chunk(ids, 100).map((c) => c.length)).toEqual([100, 100, 50]);
    expect(chunk([], 100)).toEqual([]);
  });

  it("페이지가 가득 차면 다음 페이지를 계속 받는다 (I1)", async () => {
    const all = Array.from({ length: 2500 }, (_, i) => i);
    const calls: Array<[number, number]> = [];
    const got = await fetchAllPages(async (from, to) => {
      calls.push([from, to]);
      return all.slice(from, to + 1);
    }, 1000);
    expect(got.length).toBe(2500);
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });
});

describe("피드백 읽음·열람 기록 변환", () => {
  it("v_feedback의 readAt을 읽고 없으면 null", () => {
    expect(rowToFeedback({ id: "f", sessionId: "s", teacherId: "t", content: "c", createdAt: "x", readAt: "2026-11-14T00:00:00Z" }).readAt).toBe("2026-11-14T00:00:00Z");
    expect(rowToFeedback({ id: "f", sessionId: "s", teacherId: "t", content: "c", createdAt: "x", readAt: null }).readAt).toBeNull();
  });
  it("v_audit_logs 행을 그대로 옮긴다", () => {
    expect(rowToAuditLog({ id: "a", actorId: "t", actorName: "김교사", action: "VIEW_STUDENT_DETAIL", studentId: "s", createdAt: "x" })).toEqual({
      id: "a", actorId: "t", actorName: "김교사", action: "VIEW_STUDENT_DETAIL", studentId: "s", createdAt: "x",
    });
  });
});


describe("신고 결과 변환", () => {
  it("백엔드가 review를 주면 그대로, 없거나 모르는 값이면 교사에게 간 것으로", () => {
    expect(toReportOutcome({ review: "AI_OK", message: "괜찮아요" })).toEqual({ review: "AI_OK", message: "괜찮아요" });
    expect(toReportOutcome({ review: "AI_ERROR" }).review).toBe("AI_ERROR");
    expect(toReportOutcome({ ok: true })).toMatchObject({ review: "TO_TEACHER" });
    expect(toReportOutcome({ review: "HACK" }).review).toBe("TO_TEACHER");
    expect(toReportOutcome(null).message).not.toBe("");
  });

  it("신고 목록 행에 새 필드가 없으면 aiReview·문항 신고 수 모두 null (모르는 값을 1로 꾸미지 않음)", () => {
    const row = { reportId: "r", topicName: "t", prompt: "p", choices: ["a"], answerIndex: 0, explanation: "e", reason: "UNCLEAR" as const, status: "OPEN" as const, studentNumber: 1, studentReportCount: 1, createdAt: "c" };
    expect(normalizeReportedQuestion(row as never)).toMatchObject({ aiReview: null, questionReportCount: null });
    expect(normalizeReportedQuestion({ ...row, aiReview: { verdict: "OK", reason: "x" }, questionReportCount: 3 })).toMatchObject({ aiReview: { verdict: "OK" }, questionReportCount: 3 });
  });
});

describe("realtimeStatus", () => {
  it("SUBSCRIBED면 ok, 오류·시간 초과는 언제든 unavailable, CLOSED는 구독 전일 때만 unavailable", () => {
    expect(realtimeStatus("SUBSCRIBED", false)).toBe("ok");
    expect(realtimeStatus("CHANNEL_ERROR", false)).toBe("unavailable");
    expect(realtimeStatus("CHANNEL_ERROR", true)).toBe("unavailable");
    expect(realtimeStatus("TIMED_OUT", false)).toBe("unavailable");
    expect(realtimeStatus("CLOSED", false)).toBe("unavailable");
    expect(realtimeStatus("CLOSED", true)).toBeNull();
    expect(realtimeStatus("JOINING", false)).toBeNull();
  });
});
