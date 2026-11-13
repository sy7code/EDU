import { describe, expect, it } from "vitest";
import { matchStudent } from "./studentSearch";

const S = { name: "김가온", number: 5 };

describe("학생 검색", () => {
  it("빈 검색·공백만이면 모두 보인다", () => {
    expect(matchStudent(S, "")).toBe(true);
    expect(matchStudent(S, "   ")).toBe(true);
  });
  it("이름 일부(공백 무시)로 찾는다", () => {
    expect(matchStudent(S, "가온")).toBe(true);
    expect(matchStudent(S, " 김 가 ")).toBe(true);
    expect(matchStudent(S, "나래")).toBe(false);
  });
  it("숫자만 넣으면 번호가 같은 학생", () => {
    expect(matchStudent(S, "5")).toBe(true);
    expect(matchStudent(S, "15")).toBe(false);
    expect(matchStudent({ name: "학생05", number: 5 }, "05")).toBe(true);
  });
  it("영문 이름은 대소문자 무시", () => {
    expect(matchStudent({ name: "Alex", number: 1 }, "alex")).toBe(true);
  });
});
