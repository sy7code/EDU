import { describe, expect, it } from "vitest";
import { currentTerm, isInSeoulWeek, seoulWeekStart } from "./schoolCalendar";

describe("currentTerm", () => {
  it("3월 1일 0시(서울)는 1학기", () => {
    expect(currentTerm(new Date("2026-03-01T00:00:00+09:00"))).toBe("2026-1");
  });
  it("8월 31일 23:59(서울)는 1학기", () => {
    expect(currentTerm(new Date("2026-08-31T23:59:00+09:00"))).toBe("2026-1");
  });
  it("9월 1일 0시(서울)는 2학기", () => {
    expect(currentTerm(new Date("2026-09-01T00:00:00+09:00"))).toBe("2026-2");
  });
  it("다음 해 2월은 전년도 2학기", () => {
    expect(currentTerm(new Date("2027-02-28T12:00:00+09:00"))).toBe("2026-2");
  });
  it("UTC로는 2월이어도 서울이 3월 1일이면 1학기", () => {
    expect(currentTerm(new Date("2026-02-28T15:30:00Z"))).toBe("2026-1");
  });
});

describe("seoulWeekStart", () => {
  it("토요일은 그 주 월요일", () => {
    expect(seoulWeekStart(new Date("2026-11-14T12:00:00+09:00"))).toBe("2026-11-09");
  });
  it("일요일 23:59(서울)도 그 주 월요일", () => {
    expect(seoulWeekStart(new Date("2026-11-15T23:59:00+09:00"))).toBe("2026-11-09");
  });
  it("서울 월요일 0시(UTC 일요일 15:00)는 다음 주", () => {
    expect(seoulWeekStart(new Date("2026-11-15T15:00:00Z"))).toBe("2026-11-16");
  });
});

describe("isInSeoulWeek", () => {
  it("일요일 23:59(서울)는 그 주에 든다", () => {
    expect(isInSeoulWeek("2026-11-15T14:59:00Z", "2026-11-09")).toBe(true);
  });
  it("월요일 0시(서울)는 다음 주라 들지 않는다", () => {
    expect(isInSeoulWeek("2026-11-15T15:00:00Z", "2026-11-09")).toBe(false);
  });
});
