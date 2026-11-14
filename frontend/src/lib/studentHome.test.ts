import { describe, expect, it } from "vitest";
import type { Feedback, LearningSession, QuizAttempt } from "../types/domain";
import { latestAttempt, summarizeWeek, unreadFeedback } from "./studentHome";

const NOW = new Date("2026-11-14T12:00:00Z");
const DAY = 86400000;
const sess = (id: string, daysAgo: number, minutes: number | null): LearningSession => ({
  id,
  studentId: "s",
  goal: { subject: "수학", activities: [] },
  startedAt: new Date(NOW.getTime() - daysAgo * DAY).toISOString(),
  endedAt: null,
  startAuth: "QR",
  endAuth: null,
  status: minutes === null ? "ACTIVE" : "ENDED",
  durationMinutes: minutes,
});
const att = (id: string, daysAgo: number, correct: number, total: number): QuizAttempt => ({
  id, sessionId: id, topicId: "t-" + id, studentId: "s", correct, total, createdAt: new Date(NOW.getTime() - daysAgo * DAY).toISOString(), items: [],
});
const fb = (id: string, daysAgo: number): Feedback => ({ id, sessionId: "x", teacherId: "t", content: id, createdAt: new Date(NOW.getTime() - daysAgo * DAY).toISOString(), readAt: null });

describe("학생 홈 요약", () => {
  it("이번 주 학습: 7일 안 세션만, 진행 중은 0분", () => {
    expect(summarizeWeek([sess("a", 1, 60), sess("b", 3, 30), sess("c", 8, 90), sess("d", 0, null)], NOW)).toEqual({ count: 3, minutes: 90 });
  });
  it("학습이 없으면 0회 0분", () => {
    expect(summarizeWeek([], NOW)).toEqual({ count: 0, minutes: 0 });
  });
  it("가장 최근 응시를 고르고, 채점 문항 0개·빈 값은 뺀다", () => {
    expect(latestAttempt([att("old", 5, 3, 5), null, att("new", 1, 5, 5), att("void", 0, 0, 0)])?.id).toBe("new");
    expect(latestAttempt([null, undefined])).toBeNull();
  });
});

describe("안 읽은 피드백", () => {
  it("readAt이 없는 것만 세고 가장 최근 것을 고른다", () => {
    const r = unreadFeedback([{ ...fb("read", 1), readAt: "2026-11-14T00:00:00Z" }, fb("a", 5), fb("b", 2)]);
    expect(r.count).toBe(2);
    expect(r.latest?.id).toBe("b");
  });
  it("모두 읽었으면 0개, null", () => {
    expect(unreadFeedback([{ ...fb("read", 1), readAt: "x" }])).toEqual({ count: 0, latest: null });
  });
});

