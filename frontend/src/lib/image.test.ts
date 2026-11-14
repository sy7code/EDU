import { describe, expect, it } from "vitest";
import { fitWithin } from "./image";

describe("사진 크기 줄이기", () => {
  it("가로가 긴 사진은 가로를 1600으로 맞추고 비율을 지킨다", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
  });
  it("세로가 긴 사진은 세로를 맞춘다", () => {
    expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: 1600 });
  });
  it("이미 작은 사진은 키우지 않는다", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
  it("아주 가늘고 긴 사진도 변이 0이 되지 않는다", () => {
    expect(fitWithin(100000, 10)).toEqual({ width: 1600, height: 1 });
  });
});
