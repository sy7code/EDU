import { describe, expect, it } from "vitest";
import { ApiError } from "../api/types";
import { clearKioskToken, KIOSK_TOKEN_KEY, kioskError, loadKioskToken, saveKioskToken } from "./kioskToken";

function memStorage(init: Record<string, string> = {}): Storage {
  const m = new Map(Object.entries(init));
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

/** 모든 접근이 예외를 던지는 저장소 (사생활 보호 모드 등) */
function brokenStorage(): Storage {
  const boom = () => {
    throw new Error("blocked");
  };
  return { length: 0, clear: boom, getItem: boom, key: boom, removeItem: boom, setItem: boom };
}

describe("loadKioskToken", () => {
  it("저장된 토큰을 돌려준다", () => {
    expect(loadKioskToken(memStorage({ [KIOSK_TOKEN_KEY]: "dev-tok" }))).toBe("dev-tok");
  });
  it("없거나 빈 값·저장소 없음·접근 실패면 null", () => {
    expect(loadKioskToken(memStorage())).toBeNull();
    expect(loadKioskToken(memStorage({ [KIOSK_TOKEN_KEY]: "  " }))).toBeNull();
    expect(loadKioskToken(null)).toBeNull();
    expect(loadKioskToken(brokenStorage())).toBeNull();
  });
});

describe("saveKioskToken", () => {
  it("앞뒤 공백을 빼고 저장하고 true", () => {
    const s = memStorage();
    expect(saveKioskToken(s, "  dev-tok \n")).toBe(true);
    expect(s.getItem(KIOSK_TOKEN_KEY)).toBe("dev-tok");
  });
  it("빈 값·저장소 없음·저장 실패면 false", () => {
    const s = memStorage();
    expect(saveKioskToken(s, "   ")).toBe(false);
    expect(s.getItem(KIOSK_TOKEN_KEY)).toBeNull();
    expect(saveKioskToken(null, "dev-tok")).toBe(false);
    expect(saveKioskToken(brokenStorage(), "dev-tok")).toBe(false);
  });
});

describe("clearKioskToken", () => {
  it("지우고 true, 저장소 없음·실패면 false", () => {
    const s = memStorage({ [KIOSK_TOKEN_KEY]: "dev-tok" });
    expect(clearKioskToken(s)).toBe(true);
    expect(s.getItem(KIOSK_TOKEN_KEY)).toBeNull();
    expect(clearKioskToken(null)).toBe(false);
    expect(clearKioskToken(brokenStorage())).toBe(false);
  });
});

describe("kioskError", () => {
  it("토큰이 없으면 설정 필요 + needsSetup", () => {
    expect(kioskError(new ApiError("DEVICE_NOT_CONFIGURED"))).toEqual({ message: "단말기 설정이 필요해요.", needsSetup: true });
  });
  it("401(단말기 토큰 틀림·deviceId 불일치)은 설정 확인 + needsSetup", () => {
    expect(kioskError(new ApiError("UNAUTHENTICATED"))).toEqual({ message: "단말기 설정을 확인해 주세요.", needsSetup: true });
  });
  it("이미 쓴·만료 QR은 다시 만들라는 문구", () => {
    expect(kioskError(new ApiError("QR_TOKEN_USED_OR_EXPIRED"))).toEqual({
      message: "이미 쓴 QR이거나 시간이 지났어요. 휴대폰에서 QR을 다시 만들어 주세요.",
      needsSetup: false,
    });
  });
  it("그 밖의 오류는 공통 문구", () => {
    expect(kioskError(new ApiError("RATE_LIMITED"))).toEqual({ message: "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.", needsSetup: false });
  });
});
