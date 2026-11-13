import { describe, expect, it } from "vitest";
import { matchesFilter } from "./dashboardFilter";
import type { DashboardRow } from "../types/domain";

const row = (over: Partial<DashboardRow>): DashboardRow => ({
  studentId: "a",
  name: "학생01",
  number: 1,
  sessionCount: 1,
  totalMinutes: 30,
  openQuestionCount: 0,
  lastSessionAt: null,
  needsAttention: false,
  hasReflectionWithoutFeedback: false,
  activeNow: false,
  pendingAssessment: 0,
  lastQuizRate: null,
  ...over,
});

describe("대시보드 필터", () => {
  it("'피드백 기다림'은 피드백 없는 돌아보기가 있는 학생만 고른다", () => {
    expect(matchesFilter(row({ hasReflectionWithoutFeedback: true }), "feedback")).toBe(true);
    expect(matchesFilter(row({ needsAttention: true }), "feedback")).toBe(false);
  });

  it("기존 조건과 '전체'는 그대로", () => {
    expect(matchesFilter(row({ needsAttention: true }), "attention")).toBe(true);
    expect(matchesFilter(row({ hasReflectionWithoutFeedback: true }), "attention")).toBe(false);
    expect(matchesFilter(row({ activeNow: true }), "active")).toBe(true);
    expect(matchesFilter(row({ pendingAssessment: 2 }), "pending")).toBe(true);
    expect(matchesFilter(row({}), "all")).toBe(true);
  });
});
