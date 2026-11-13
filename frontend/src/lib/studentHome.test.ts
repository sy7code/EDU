import { describe, expect, it } from "vitest";
import type { Feedback, LearningSession, QuizAttempt } from "../types/domain";
import { latestAttempt, recentFeedback, summarizeWeek } from "./studentHome";

const NOW = new Date("2026-11-14T12:00:00Z");
const DAY = 86400000;
const sess = (id: string, daysAgo: number, minutes: number | null): LearningSession => ({
  id,
  studentId: "s",
  goal: { subject: "수학", activities: [] },
  startedAt: new Date(NOW.getTime() - daysAgo * DAY).toISOString(),
  endedAt: null,
  startAuth: "FACEPASS",
  endAuth: null,
  status: minutes === null ? "ACTIVE" : "ENDED",
  durationMinutes: minutes,
});
const att = (id: string, daysAgo: number, correct: number, total: number): QuizAttempt => ({
  id, sessionId: id, topicId: "t-" + id, studentId: "s", correct, total, createdAt: new Date(NOW.getTime() - daysAgo * DAY).toISOString(), items: [],
});
const fb = (id: string, daysAgo: number): Feedback => ({ id, sessionId: "x", teacherId: "t", content: id, createdAt: new Date(NOW.getTime() - daysAgo * DAY).toISOString() });

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
  it("최근 7일 피드백 개수와 가장 최근 것", () => {
    const r = recentFeedback([fb("old", 9), fb("mid", 3), fb("new", 1)], NOW);
    expect(r.count).toBe(2);
    expect(r.latest?.id).toBe("new");
  });
  it("피드백이 없으면 0개, null", () => {
    expect(recentFeedback([], NOW)).toEqual({ count: 0, latest: null });
  });
});
