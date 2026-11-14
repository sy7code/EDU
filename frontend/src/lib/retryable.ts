import { ApiError } from "../api/types";

/** 다시 시도해도 소용없는 권한 오류 (교과 교사가 열람 범위 밖 주소를 연 경우 등) */
export function isRetryable(error: unknown): boolean {
  return !(error instanceof ApiError && (error.code === "NOT_FOUND" || error.code === "FORBIDDEN"));
}
