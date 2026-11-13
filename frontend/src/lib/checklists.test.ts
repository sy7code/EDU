import { describe, expect, it } from "vitest";
import { goalLabel } from "./checklists";

describe("goalLabel", () => {
  it("활동이 없으면 오늘 할 것만 보여 준다", () => {
    expect(goalLabel({ subject: "이차함수 꼭짓점 복습", activities: [] })).toBe("이차함수 꼭짓점 복습");
  });
  it("활동이 있으면 · 로 이어 보여 준다", () => {
    expect(goalLabel({ subject: "수학", activities: ["concept", "problem"] })).toBe("수학 · 개념 이해하기, 문제 풀기");
  });
});
