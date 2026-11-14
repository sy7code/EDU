import { describe, it, expect } from "vitest";
import { reviewTopicsBySubject, sessionReviewLine } from "./reviewTopics";
import type { ReviewInputs } from "../types/domain";

const empty: ReviewInputs = { sessions: [], sessionTopics: [], attempts: [], reflections: [] };

describe("reviewTopicsBySubject", () => {
  it("같은 주제라도 과목별로 따로 판단한다", () => {
    const r = reviewTopicsBySubject({
      ...empty,
      sessions: [
        { id: "s1", subject: "수학", startedAt: "2026-11-01T00:00:00Z" },
        { id: "s2", subject: "국어", startedAt: "2026-11-02T00:00:00Z" },
      ],
      sessionTopics: [
        { sessionId: "s1", topicId: "T", name: "이차함수" },
        { sessionId: "s2", topicId: "T", name: "이차함수" },
      ],
      attempts: [
        { sessionId: "s1", topicId: "T", correct: 1, total: 5, createdAt: "2026-11-01T01:00:00Z" },
        { sessionId: "s2", topicId: "T", correct: 5, total: 5, createdAt: "2026-11-02T01:00:00Z" },
      ],
    });
    expect(r).toEqual([{ subject: "수학", topics: [{ topicId: "T", name: "이차함수", signal: "LOW_SCORE", lastRate: 0.2, lastAt: "2026-11-01T01:00:00Z" }] }]);
  });

  it("채점 문항 3개 미만은 빼고, 과목당 최근 3개만", () => {
    const sessions = Array.from({ length: 6 }, (_, k) => ({ id: `s${k}`, subject: "수학", startedAt: "2026-11-01T00:00:00Z" }));
    const attempts = sessions.map((s, k) => ({ sessionId: s.id, topicId: `t${k}`, correct: 0, total: k === 5 ? 2 : 5, createdAt: `2026-11-0${k + 1}T00:00:00Z` }));
    const r = reviewTopicsBySubject({
      ...empty,
      sessions,
      sessionTopics: sessions.map((s, k) => ({ sessionId: s.id, topicId: `t${k}`, name: `n${k}` })),
      attempts,
    });
    expect(r[0].topics.map((t) => t.topicId)).toEqual(["t4", "t3", "t2"]);
  });

  it("이해도 3인데 60% 미만이면 OVERCONFIDENT", () => {
    const r = reviewTopicsBySubject({
      sessions: [{ id: "s1", subject: "수학", startedAt: "2026-11-01T00:00:00Z" }],
      sessionTopics: [{ sessionId: "s1", topicId: "T", name: "이차함수" }],
      attempts: [{ sessionId: "s1", topicId: "T", correct: 5, total: 10, createdAt: "2026-11-01T01:00:00Z" }],
      reflections: [{ sessionId: "s1", understanding: 3 }],
    });
    expect(r.map((x) => x.topics.map((t) => t.signal))).toEqual([["OVERCONFIDENT"]]);
  });
});

describe("sessionReviewLine", () => {
  it("과목 - 주제 문구는 3문항 이상·40% 미만일 때만", () => {
    expect(sessionReviewLine("수학", "이차함수 그래프", 1, 5)).toBe("수학 - 이차함수 그래프");
    expect(sessionReviewLine("수학", "이차함수 그래프", 1, 2)).toBeNull();
    expect(sessionReviewLine("수학", "이차함수 그래프", 2, 5)).toBeNull();
  });
});
