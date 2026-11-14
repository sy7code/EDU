import { describe, expect, it } from "vitest";
import { themesHeaderLabel } from "./themesLabel";

describe("themesHeaderLabel", () => {
  it("서울 시각으로 'M월 D일 HH:mm 만듦'", () => {
    expect(themesHeaderLabel("2026-11-14T04:20:00Z")).toBe("AI 요약 · 참고용 · 11월 14일 13:20 만듦");
  });
  it("자정 넘김은 서울 날짜로", () => {
    expect(themesHeaderLabel("2026-11-14T15:05:00Z")).toBe("AI 요약 · 참고용 · 11월 15일 00:05 만듦");
  });
  it("null이면 시각 생략", () => {
    expect(themesHeaderLabel(null)).toBe("AI 요약 · 참고용");
  });
});
