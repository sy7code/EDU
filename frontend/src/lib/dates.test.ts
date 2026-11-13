import { describe, expect, it } from "vitest";
import { byNewest, seoulDaysStart } from "./dates";

describe("서울 날짜 기간", () => {
  it("오늘 포함 7일: 서울 6일 전 0시부터", () => {
    expect(seoulDaysStart(new Date("2026-11-14T12:00:00Z"), 7).toISOString()).toBe("2026-11-07T15:00:00.000Z");
  });
  it("UTC로는 전날이어도 서울 날짜로 센다 (서울 새벽 1시)", () => {
    expect(seoulDaysStart(new Date("2026-11-14T16:00:00Z"), 7).toISOString()).toBe("2026-11-08T15:00:00.000Z");
  });
});

describe("최신 순 정렬", () => {
  it("소수점 자리 수가 달라도 시각으로 비교", () => {
    const xs = [{ createdAt: "2026-11-14T12:00:00.123+00:00" }, { createdAt: "2026-11-14T12:00:00.5+00:00" }];
    expect([...xs].sort(byNewest)[0].createdAt).toBe("2026-11-14T12:00:00.5+00:00");
  });
  it("시간대 표기가 달라도 같은 기준", () => {
    const xs = [{ createdAt: "2026-11-14T21:00:00+09:00" }, { createdAt: "2026-11-14T12:30:00Z" }];
    expect([...xs].sort(byNewest)[0].createdAt).toBe("2026-11-14T12:30:00Z");
  });
});
