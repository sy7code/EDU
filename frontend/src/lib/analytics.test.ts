import { describe, expect, it } from "vitest";
import type { ClassAnalyticsRaw, LearningSession } from "../types/domain";
import { summarizeClass } from "./analytics";

function session(id: string, studentId: string, minutes: number | null): LearningSession {
  return {
    id,
    studentId,
    goal: { subject: "수학", activities: [] },
    startedAt: "2026-11-10T10:00:00Z",
    endedAt: minutes === null ? null : "2026-11-10T11:00:00Z",
    startAuth: "QR",
    endAuth: minutes === null ? null : "QR",
    status: minutes === null ? "ACTIVE" : "ENDED",
    durationMinutes: minutes,
  };
}

function raw(p: Partial<ClassAnalyticsRaw>): ClassAnalyticsRaw {
  return { classId: "c", from: "f", to: "t", students: [], sessions: [], questions: [], attempts: [], sessionTopics: [], ...p };
}

const A = { studentId: "a", name: "학생01", number: 1, shared: true };
const B = { studentId: "b", name: "학생02", number: 2, shared: true };
const HIDDEN = { studentId: "h", name: "학생03", number: 3, shared: false };
const q = (id: string, studentId: string, content: string, sessionId = "s-" + studentId) => ({ id, sessionId, studentId, content, createdAt: "2026-11-10T10:30:00Z" });
const att = (studentId: string, correct: number, total: number, topicId = "t1", sessionId = "s-" + studentId) => ({ sessionId, studentId, topicId, correct, total, createdAt: "2026-11-10T11:00:00Z" });

describe("반 분석 집계", () => {
  it("빈 반은 모든 평균이 null이고 제외 0명", () => {
    const r = summarizeClass(raw({}));
    expect(r.minutes.mean).toBeNull();
    expect(r.quizRate.mean).toBeNull();
    expect(r.questions.mean).toBeNull();
    expect(r.topTopics).toEqual([]);
    expect(r.excludedCount).toBe(0);
  });

  it("학습 시간 평균·중앙값과 구간", () => {
    const r = summarizeClass(raw({ students: [A, B], sessions: [session("s1", "a", 90), session("s2", "b", 30)] }));
    expect(r.minutes.mean).toBe(60);
    expect(r.minutes.median).toBe(60);
    expect(r.minutes.buckets.map((b) => b.count)).toEqual([0, 1, 1, 0, 0]);
    expect(r.minutes.buckets.map((b) => b.label)).toEqual(["0", "1~59분", "1~3시간", "3~5시간", "5시간+"]);
  });

  it("기록 비공개 학생은 질문·정답률 집계에서 빠지고 학습 시간에는 들어간다", () => {
    const r = summarizeClass(
      raw({
        students: [A, HIDDEN],
        sessions: [session("s-a", "a", 60), session("s-h", "h", 120)],
        questions: [q("q1", "a", "왜 그래?"), q("q2", "h", "답 알려줘")],
        attempts: [att("a", 4, 5), att("h", 1, 5)],
      }),
    );
    const h = r.students.find((s) => s.studentId === "h")!;
    expect(h.questionCount).toBeNull();
    expect(h.quizRate).toBeNull();
    expect(h.types).toBeNull();
    expect(h.minutes).toBe(120);
    expect(r.excludedCount).toBe(1);
    expect(r.questions.mean).toBe(1);
    expect(r.quizRate.mean).toBe(0.8);
    expect(r.minutes.mean).toBe(90);
    expect(r.types.ANSWER).toBe(0);
  });

  it("응시가 없으면 정답률 평균은 null (NaN 아님)", () => {
    const r = summarizeClass(raw({ students: [A], sessions: [session("s-a", "a", 30)] }));
    expect(r.quizRate.mean).toBeNull();
    expect(r.quizRate.median).toBeNull();
    expect(r.students[0].quizRate).toBeNull();
  });

  it("채점 문항이 0인 응시(전부 신고)는 정답률에서 뺀다", () => {
    const r = summarizeClass(raw({ students: [A], attempts: [att("a", 0, 0)] }));
    expect(r.students[0].quizRate).toBeNull();
  });

  it("학생 정답률은 응시들의 맞힌 수 합 / 채점 문항 합", () => {
    const r = summarizeClass(raw({ students: [A], attempts: [att("a", 3, 5, "t1", "s1"), att("a", 4, 5, "t1", "s2")] }));
    expect(r.students[0].quizRate).toBe(0.7);
  });

  it("질문 유형을 세고 가장 많은 유형을 주 유형으로", () => {
    const r = summarizeClass(
      raw({ students: [A], questions: [q("1", "a", "답 알려줘"), q("2", "a", "정답이 뭐야?"), q("3", "a", "왜 그래?")] }),
    );
    expect(r.students[0].questionCount).toBe(3);
    expect(r.students[0].types?.ANSWER).toBe(2);
    expect(r.students[0].mainType).toBe("ANSWER");
    expect(r.types).toEqual({ CONCEPT: 1, CHECK: 0, ANSWER: 2, OTHER: 0 });
  });

  it("질문이 없으면 주 유형 null, 질문 수 0", () => {
    const r = summarizeClass(raw({ students: [A] }));
    expect(r.students[0].questionCount).toBe(0);
    expect(r.students[0].mainType).toBeNull();
  });

  it("주제 TOP은 공부한 학생 수 순, 주제별 평균 정답률", () => {
    const r = summarizeClass(
      raw({
        students: [A, B],
        sessionTopics: [
          { sessionId: "s-a", topicId: "t1", name: "꼭짓점" },
          { sessionId: "s-b", topicId: "t1", name: "꼭짓점" },
          { sessionId: "s-b2", topicId: "t2", name: "부등식" },
        ],
        sessions: [session("s-a", "a", 10), session("s-b", "b", 10), session("s-b2", "b", 10)],
        attempts: [att("a", 5, 5, "t1", "s-a"), att("b", 3, 5, "t1", "s-b")],
      }),
    );
    expect(r.topTopics.map((t) => [t.name, t.studentCount])).toEqual([["꼭짓점", 2], ["부등식", 1]]);
    expect(r.topTopics[0].avgRate).toBe(0.8);
    expect(r.topTopics[1].avgRate).toBeNull();
  });

  it("학생 목록은 번호순", () => {
    const r = summarizeClass(raw({ students: [B, A] }));
    expect(r.students.map((s) => s.number)).toEqual([1, 2]);
  });
});

describe("반 분석 최종 리뷰 수정", () => {
  it("서버 질문 유형이 있으면 규칙 분류보다 먼저 쓴다 (5-2)", () => {
    const r = summarizeClass(
      raw({ students: [A], questions: [{ ...q("1", "a", "왜 그래?"), questionType: "CHECK" }, { ...q("2", "a", "왜 그래?"), questionType: null }] }),
    );
    expect(r.types).toEqual({ CONCEPT: 1, CHECK: 1, ANSWER: 0, OTHER: 0 });
  });
});

