import { describe, expect, it } from "vitest";
import { reportCountsByStudent } from "./reportStats";
import type { ReportedQuestion } from "../types/domain";

const row = (studentNumber: number | null, status: ReportedQuestion["status"]): ReportedQuestion => ({
  reportId: Math.random().toString(),
  topicName: "t",
  prompt: "p",
  choices: ["a", "b"],
  answerIndex: 0,
  explanation: "e",
  reason: "UNCLEAR",
  status,
  aiReview: null,
  questionReportCount: 1,
  studentNumber,
  studentReportCount: null,
  createdAt: "2026-11-14T00:00:00Z",
});

describe("학생별 신고 수", () => {
  it("AI가 걸러 낸 신고까지 세고, 많은 순·번호 순으로", () => {
    const out = reportCountsByStudent([
      row(3, "AI_CLEARED"),
      row(3, "AI_CLEARED"),
      row(3, "OPEN"),
      row(1, "DISMISSED"),
      row(2, "AI_CLEARED"),
      row(null, "AI_CLEARED"),
      row(null, "OPEN"),
    ]);
    expect(out.students).toEqual([
      { studentNumber: 3, total: 3, aiCleared: 2 },
      { studentNumber: 1, total: 1, aiCleared: 0 },
      { studentNumber: 2, total: 1, aiCleared: 1 },
    ]);
    expect(out.anonymous).toBe(2);
  });
});
