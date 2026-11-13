import { describe, expect, it } from "vitest";
import { parseTab } from "./tabs";

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
