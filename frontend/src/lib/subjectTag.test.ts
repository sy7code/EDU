import { describe, expect, it } from "vitest";
import { buildGoal, suggestSubject } from "./subjectTag";

describe("suggestSubject", () => {
  it("과목 이름이 하나 있으면 그 과목을 제안한다", () => {
    expect(suggestSubject("수학 이차함수 복습")).toBe("수학");
  });
  it("과목 이름이 없으면 null", () => {
    expect(suggestSubject("이차함수 꼭짓점 복습")).toBeNull();
  });
  it("과목 이름이 둘이면 정하지 않는다(null)", () => {
    expect(suggestSubject("수학 숙제 끝내고 영어 단어")).toBeNull();
  });
  it("기타는 제안하지 않는다", () => {
    expect(suggestSubject("기타 연습")).toBeNull();
  });
});

describe("buildGoal", () => {
  it("고른 과목은 subject, 오늘 할 것은 note에 둔다", () => {
    expect(buildGoal("  이차함수 복습 ", "수학", ["concept"])).toEqual({ subject: "수학", activities: ["concept"], note: "이차함수 복습" });
  });
  it("과목을 안 고르면 기타", () => {
    expect(buildGoal("국어 시 읽기", null, [])).toEqual({ subject: "기타", activities: [], note: "국어 시 읽기" });
  });
});
