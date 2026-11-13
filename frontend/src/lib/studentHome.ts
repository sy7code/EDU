// 학생 홈 요약 카드용 순수 함수
import { byNewest, seoulDaysStart } from "./dates";
import type { Feedback, LearningSession, QuizAttempt } from "../types/domain";


/** 최근 7일(오늘 포함 서울 날짜, 대시보드와 같은 정의) 안에 시작한 학습 횟수·시간 (진행 중은 0분) */
export function summarizeWeek(sessions: LearningSession[], now: Date): { count: number; minutes: number } {
  const from = seoulDaysStart(now, 7).getTime();
  const inWeek = sessions.filter((x) => {
    const t = Date.parse(x.startedAt);
    return t >= from && t <= now.getTime();
  });
  return { count: inWeek.length, minutes: inWeek.reduce((n, x) => n + (x.durationMinutes ?? 0), 0) };
}

/** 가장 최근에 본 확인 테스트 (채점 문항이 있는 것만). 없으면 null */
export function latestAttempt(attempts: Array<QuizAttempt | null | undefined>): QuizAttempt | null {
  const scored = attempts.filter((a): a is QuizAttempt => !!a && a.total > 0);
  return scored.sort(byNewest)[0] ?? null;
}

/** 안 읽은 피드백 개수와 가장 최근 한 개 */
export function unreadFeedback(feedback: Feedback[]): { count: number; latest: Feedback | null } {
  const unread = feedback.filter((f) => !f.readAt).sort(byNewest);
  return { count: unread.length, latest: unread[0] ?? null };
}
