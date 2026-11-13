import { describe, expect, it } from "vitest";
import { parseTab, studentDetailTab, myRecordsTab } from "./tabs";

const TABS = ["summary", "records", "questions"] as const;

describe("탭 값 읽기", () => {
  it("허용된 값은 그대로", () => {
    expect(parseTab("records", TABS, "summary")).toBe("records");
  });
  it("없거나 모르는 값은 기본 탭", () => {
    expect(parseTab(null, TABS, "summary")).toBe("summary");
    expect(parseTab("hack", TABS, "summary")).toBe("summary");
  });
});

describe("교사 학생 상세 기본 탭 (리뷰 I3)", () => {
  it("tab 없이 session만 있으면 학습 기록", () => {
    expect(studentDetailTab(null, "s1")).toBe("records");
  });
  it("잘못된 tab 값은 session이 있어도 요약", () => {
    expect(studentDetailTab("hack", "s1")).toBe("summary");
  });
  it("둘 다 없으면 요약, 올바른 값은 그대로", () => {
    expect(studentDetailTab(null, null)).toBe("summary");
    expect(studentDetailTab("questions", "s1")).toBe("questions");
  });
});


describe("내 기록 탭", () => {
  it("notes만 내 정리, 없거나 모르는 값은 학습 목록", () => {
    expect(myRecordsTab("notes")).toBe("notes");
    expect(myRecordsTab(null)).toBe("list");
    expect(myRecordsTab("x")).toBe("list");
  });
});
