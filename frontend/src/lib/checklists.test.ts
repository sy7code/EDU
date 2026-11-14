import { describe, expect, it } from "vitest";
import { goalLabel, goalParts } from "./checklists";

describe("goalLabel", () => {
  it("활동이 없으면 오늘 할 것만 보여 준다", () => {
    expect(goalLabel({ subject: "이차함수 꼭짓점 복습", activities: [] })).toBe("이차함수 꼭짓점 복습");
  });
  it("활동이 있으면 · 로 이어 보여 준다", () => {
    expect(goalLabel({ subject: "수학", activities: ["concept", "problem"] })).toBe("수학 · 개념 이해하기, 문제 풀기");
  });
});

describe("goalLabel 과목 태그", () => {
  it("과목을 고르고 오늘 할 것을 쓰면 '과목 · 오늘 할 것'", () => {
    expect(goalLabel({ subject: "수학", activities: [], note: "이차함수 복습" })).toBe("수학 · 이차함수 복습");
  });
  it("기타는 태그 없이 오늘 할 것만", () => {
    expect(goalLabel({ subject: "기타", activities: ["concept"], note: "시 읽기" })).toBe("시 읽기 · 개념 이해하기");
  });
  it("예전 형식(과목 칸에 자유 입력)은 그 글을 제목으로, 예전 메모는 제목에 넣지 않는다", () => {
    expect(goalLabel({ subject: "복습", activities: [], note: "꼭짓점" })).toBe("복습");
    expect(goalParts({ subject: "이차함수 복습", activities: [] })).toEqual({ tag: null, text: "이차함수 복습" });
  });
  it("goalParts: 새 형식은 과목 태그와 오늘 할 것으로 나눈다", () => {
    expect(goalParts({ subject: "영어", activities: [], note: "단어 외우기" })).toEqual({ tag: "영어", text: "단어 외우기" });
  });
});
