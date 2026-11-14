// 교실 단말기 토큰: 비밀값이라 번들(VITE_*)에 넣지 않고, 단말기에서 한 번 입력해 그 브라우저에만 저장한다.
// 값은 로그·화면에 남기지 않는다.
import { ApiError, errorMessage } from "../api/types";

export const KIOSK_TOKEN_KEY = "growth-pace-kiosk-token";

/** 저장된 단말기 토큰 (없거나 저장소가 막혀 있으면 null) */
export function loadKioskToken(storage: Storage | null): string | null {
  try {
    const v = storage?.getItem(KIOSK_TOKEN_KEY)?.trim();
    return v ? v : null;
  } catch {
    return null;
  }
}

/** 단말기 토큰 저장. 빈 값이거나 저장 실패면 false */
export function saveKioskToken(storage: Storage | null, token: string): boolean {
  const v = token.trim();
  if (!v || !storage) return false;
  try {
    storage.setItem(KIOSK_TOKEN_KEY, v);
    return true;
  } catch {
    return false;
  }
}

/** 단말기 토큰 지우기. 저장소가 막혀 있으면 false */
export function clearKioskToken(storage: Storage | null): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(KIOSK_TOKEN_KEY);
    return true;
  } catch {
    return false;
  }
}

/** 키오스크 화면 문구. needsSetup이면 토큰 다시 입력을 권한다 */
export function kioskError(err: unknown): { message: string; needsSetup: boolean } {
  const code = err instanceof ApiError ? err.code : "UNKNOWN";
  if (code === "DEVICE_NOT_CONFIGURED") return { message: errorMessage(err), needsSetup: true };
  // 단말기 쪽 401: 헤더 토큰이 없거나 틀림, deviceId 불일치 (학생 로그인 문제가 아님)
  if (code === "UNAUTHENTICATED") return { message: "단말기 설정을 확인해 주세요.", needsSetup: true };
  return { message: errorMessage(err), needsSetup: false };
}
