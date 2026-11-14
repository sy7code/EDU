import { describe, expect, it } from "vitest";
import { quizSignal } from "./topicSignal";

describe("quizSignal", () => {
  it("이해 3인데 정답률 0.5면 OVERCONFIDENT", () => {
    expect(quizSignal(0.5, 3, 5)).toBe("OVERCONFIDENT");
  });

  it("정답률 0.2, 이해 1이면 LOW_SCORE", () => {
    expect(quizSignal(0.2, 1, 5)).toBe("LOW_SCORE");
  });

  it("이해 3이어도 정답률 0.6이면 신호 없음", () => {
    expect(quizSignal(0.6, 3, 5)).toBeNull();
  });

  it("채점 문항이 2개면 신호 없음", () => {
    expect(quizSignal(0.2, 1, 2)).toBeNull();
  });

  it("정답률 null이면 신호 없음", () => {
    expect(quizSignal(null, 3, 5)).toBeNull();
  });
});
