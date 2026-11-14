import { seoulDateKey } from "./pace";

const DAY = 24 * 60 * 60 * 1000;

/** 현재 학기 "YYYY-N". 서울 날짜 3~8월 N=1, 9~12월 N=2, 1~2월은 전년도 2학기 */
export function currentTerm(now: Date): string {
  const [y, m] = seoulDateKey(now.toISOString()).split("-").map(Number);
  if (m >= 3 && m <= 8) return `${y}-1`;
  if (m >= 9) return `${y}-2`;
  return `${y - 1}-2`;
}

/** 서울 기준 그 주 월요일 YYYY-MM-DD */
export function seoulWeekStart(now: Date): string {
  const today = Date.parse(`${seoulDateKey(now.toISOString())}T00:00:00Z`);
  const dow = new Date(today).getUTCDay(); // 0 일 ~ 6 토
  return new Date(today - ((dow + 6) % 7) * DAY).toISOString().slice(0, 10);
}

/** iso 시각이 weekStart(월요일)로 시작하는 서울 주(월 0시 ~ 일 23:59)에 드는가 */
export function isInSeoulWeek(iso: string, weekStart: string): boolean {
  const day = Date.parse(`${seoulDateKey(iso)}T00:00:00Z`);
  const start = Date.parse(`${weekStart}T00:00:00Z`);
  return day >= start && day < start + 7 * DAY;
}
