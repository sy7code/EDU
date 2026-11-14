import { describe, expect, it } from "vitest";
import { resolveSkin } from "./skin";

describe("화면 테마 고르기", () => {
  it("빌드 값 pink면 분홍 테마, 없거나 모르는 값이면 기본", () => {
    expect(resolveSkin("pink", "")).toBe("pink");
    expect(resolveSkin(undefined, "")).toBe("default");
    expect(resolveSkin("purple", "")).toBe("default");
  });

  it("주소의 ?skin= 값이 빌드 값보다 앞선다 (비교해 보기용)", () => {
    expect(resolveSkin(undefined, "?skin=pink")).toBe("pink");
    expect(resolveSkin("pink", "?skin=default")).toBe("default");
    expect(resolveSkin("pink", "?tab=notes&skin=default")).toBe("default");
  });

  it("주소에 없으면 이 탭에서 전에 고른 값을 쓴다 (새로고침·주소 이동에도 유지)", () => {
    expect(resolveSkin(undefined, "", "pink")).toBe("pink");
    expect(resolveSkin("pink", "", "default")).toBe("default");
    expect(resolveSkin(undefined, "?skin=default", "pink")).toBe("default");
    expect(resolveSkin("pink", "", "weird")).toBe("pink");
  });

  it("주소 값이 모르는 값이면 빌드 값을 쓴다", () => {
    expect(resolveSkin("pink", "?skin=<script>")).toBe("pink");
  });
});
