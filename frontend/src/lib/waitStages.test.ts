import { describe, expect, it } from "vitest";
import { quizWaitText } from "./waitStages";

describe("테스트 출제 대기 문구", () => {
  it("경과 시간에 따라 주제 확인 → 문항 만들기 → 거의 다 됨 → 평소보다 오래 걸림 순으로 바뀐다", () => {
    expect(quizWaitText(0)).toBe("기록에서 주제를 확인하고 있어요 · 보통 10초쯤 걸려요");
    expect(quizWaitText(2999)).toBe("기록에서 주제를 확인하고 있어요 · 보통 10초쯤 걸려요");
    expect(quizWaitText(3000)).toBe("문항 5개를 만드는 중이에요");
    expect(quizWaitText(9000)).toBe("거의 다 됐어요");
    expect(quizWaitText(20000)).toBe("평소보다 오래 걸리고 있어요. 조금만 더 기다려 주세요");
  });

  it("음수·NaN은 처음 단계로 본다", () => {
    expect(quizWaitText(-5)).toBe(quizWaitText(0));
    expect(quizWaitText(Number.NaN)).toBe(quizWaitText(0));
  });
});
