import { describe, expect, it } from "vitest";
import { returnPath } from "./returnPath";

describe("로그인 뒤 돌아갈 주소", () => {
  it("같은 역할 화면이면 주소와 쿼리를 그대로 돌려준다 (휴대폰 QR → 학습 화면)", () => {
    expect(returnPath("/student/session/abc?kind=PAPER", "student")).toBe("/student/session/abc?kind=PAPER");
    expect(returnPath("/teacher/students/s09", "teacher")).toBe("/teacher/students/s09");
  });

  it("다른 역할 화면이거나 값이 없으면 역할의 첫 화면", () => {
    expect(returnPath("/teacher/reports", "student")).toBe("/student");
    expect(returnPath(undefined, "teacher")).toBe("/teacher");
    expect(returnPath(42, "student")).toBe("/student");
  });

  it("바깥 주소로 보내는 값은 막는다", () => {
    for (const bad of ["//evil.example/student", "https://evil.example/student", "/student\\..\\x","student/session/1", "/studentx", "/student/../teacher"]) {
      expect(returnPath(bad, "student"), bad).toBe("/student");
    }
  });
});
