// 기간·시간 비교 공용 함수 (서울 시간 기준, 서머타임 없음 UTC+9)
const KST = 9 * 3600000;
const DAY = 86400000;

/** 오늘을 포함한 서울 날짜 days일의 시작 시각 (대시보드의 '최근 7일'과 같은 정의) */
export function seoulDaysStart(now: Date, days: number): Date {
  const seoulMidnight = Math.floor((now.getTime() + KST) / DAY) * DAY - KST;
  return new Date(seoulMidnight - (days - 1) * DAY);
}

/** 최신 순 비교. 소수점 자리 수가 다른 시각 문자열도 시각으로 비교한다 */
export function byNewest(a: { createdAt: string }, b: { createdAt: string }): number {
  return Date.parse(b.createdAt) - Date.parse(a.createdAt);
}
