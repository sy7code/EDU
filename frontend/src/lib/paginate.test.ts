import { describe, expect, it } from "vitest";
import { paginate } from "./paginate";

const xs = Array.from({ length: 30 }, (_, i) => i + 1);

describe("10명씩 페이지", () => {
  it("1쪽은 1~10번, 3쪽은 21~30번, 전체 3쪽", () => {
    expect(paginate(xs, 1).items).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(paginate(xs, 3).items[0]).toBe(21);
    expect(paginate(xs, 1).pageCount).toBe(3);
  });
  it("범위 밖 페이지는 가장 가까운 쪽으로", () => {
    expect(paginate(xs, 9).page).toBe(3);
    expect(paginate(xs, 0).page).toBe(1);
  });
  it("빈 목록과 나누어떨어지지 않는 길이", () => {
    expect(paginate([], 1)).toEqual({ items: [], page: 1, pageCount: 1 });
    expect(paginate(xs.slice(0, 11), 2).items).toEqual([11]);
  });
});
