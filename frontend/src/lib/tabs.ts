/** URL 값을 허용된 탭 이름으로. 없거나 모르는 값이면 기본 탭 */
export function parseTab<T extends string>(v: string | null, allowed: readonly T[], fallback: T): T {
  return v !== null && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}
