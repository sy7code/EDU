import { afterEach, describe, expect, it, vi } from "vitest";
import { fitWithin, toJpegDataUrl } from "./image";

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

describe("toJpegDataUrl 파일 종류 확인", () => {
  afterEach(() => vi.unstubAllGlobals());
  // 테스트 환경엔 canvas가 없어 디코딩 단계까지만 본다: createImageBitmap을 부르는지
  it("파일 종류(type)가 비어 있으면 거절하지 않고 디코딩을 시도한다", async () => {
    const decode = vi.fn().mockRejectedValue(new Error("decode tried"));
    vi.stubGlobal("createImageBitmap", decode);
    await expect(toJpegDataUrl(new File([new Uint8Array([1, 2, 3])], "photo", { type: "" }))).rejects.toThrow("decode tried");
    expect(decode).toHaveBeenCalledTimes(1);
  });
  it("종류가 있는데 image/*가 아니면 디코딩 없이 거절한다", async () => {
    const decode = vi.fn();
    vi.stubGlobal("createImageBitmap", decode);
    await expect(toJpegDataUrl(new File(["x"], "a.txt", { type: "text/plain" }))).rejects.toThrow("not an image");
    expect(decode).not.toHaveBeenCalled();
  });
});
