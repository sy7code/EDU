import { describe, expect, it } from "vitest";
import {
  changedToReflection,
  goalToText,
  mapDashboard,
  mapFnError,
  mapPgError,
  reflectionToChanged,
  textToGoal,
  toGrounded,
  rowToReflection,
  latestConsents,
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
