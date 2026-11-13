import { useQueries, useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { api } from "../../api";
import { useMe } from "../../auth/session";
import { Badge, ButtonLink, Card, EmptyState, ErrorState, PageTitle, Spinner } from "../../components/ui";
import { activityLabel, goalLabel } from "../../lib/checklists";
import { elapsedLabel, formatDateTime, formatDuration } from "../../lib/time";
import { latestAttempt, summarizeWeek, unreadFeedback } from "../../lib/studentHome";
import { FEATURES } from "../../api";

export function StudentHome() {
  const me = useMe();
  const active = useQuery({ queryKey: ["active-session"], queryFn: () => api.getActiveSession() });
  const sessions = useQuery({ queryKey: ["sessions", "me"], queryFn: () => api.listSessions({}) });

  const recent = (sessions.data ?? []).filter((s) => s.status === "ENDED").slice(0, 3);
  const studentId = me.data?.id;
  const growth = useQuery({
    queryKey: ["topic-growth", studentId],
    queryFn: () => api.getTopicGrowth(studentId!),
    enabled: !!studentId && FEATURES.quiz,
    staleTime: HOME_STALE,
  });
  // 피드백은 세션마다 따로 불러야 해서 최근 학습 5개(진행 중 포함)만 본다. 화면 문구에도 범위를 밝힌다
  const fbSessions = (sessions.data ?? []).slice(0, 5);
  const fbQueries = useQueries({
    queries: fbSessions.map((s) => ({ queryKey: ["feedback", s.id], queryFn: () => api.listFeedback(s.id), staleTime: HOME_STALE })),
  });
  // 최근 확인 테스트도 같은 최근 학습 5개에서 찾는다 (성장 데이터엔 날짜가 없어 순서를 알 수 없음)
  const quizQueries = useQueries({
    queries: fbSessions.map((s) => ({ queryKey: ["quiz-attempt", s.id], queryFn: () => api.getQuizAttempt(s.id), enabled: FEATURES.quiz && s.status === "ENDED", staleTime: HOME_STALE })),
  });
  const fbLoading = fbQueries.some((q) => q.isLoading);
  const fbError = fbQueries.find((q) => q.error);
  const quizLoading = quizQueries.some((q) => q.isLoading) || growth.isLoading;
  const quizError = quizQueries.find((q) => q.error) ?? (growth.error ? growth : undefined);
  const week = summarizeWeek(sessions.data ?? [], new Date());
  const lastQuiz = latestAttempt(quizQueries.map((q) => q.data));
  const lastQuizName = growth.data?.topics.find((t) => t.topicId === lastQuiz?.topicId)?.name;
  const fb = unreadFeedback(fbQueries.flatMap((q) => q.data ?? []));

  return (
    <div>
      <PageTitle sub="오늘은 무엇을 스스로 공부해 볼까요?">{me.data?.name} 학생, 안녕하세요</PageTitle>

      {active.isLoading ? (
        <Spinner />
      ) : active.error ? (
        <ErrorState error={active.error} onRetry={() => active.refetch()} />
      ) : active.data ? (
        <Card className="border-brand-500 bg-brand-50">
          <Badge tone="brand">학습 중</Badge>
          <p className="mt-2 text-lg font-semibold">
            {goalLabel(active.data.goal)}
          </p>
          <p className="text-sm text-stone-600">{elapsedLabel(active.data.startedAt)} 째 공부하고 있어요</p>
          <ButtonLink to={`/student/session/${active.data.id}`} className="mt-4">
            학습 화면으로
          </ButtonLink>
        </Card>
      ) : (
        <Card>
          <p className="font-semibold">새 학습 시작하기</p>
          <p className="mt-1 text-sm text-stone-500">목표를 고르고, 자습실 단말기에서 인증하면 시작돼요.</p>
          <ButtonLink to="/student/start" className="mt-4">
            학습 시작
          </ButtonLink>
        </Card>
      )}

      {sessions.data && (
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Card>
            <p className="text-xs text-stone-500">최근 7일 학습</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{week.count}회</p>
            <p className="text-sm text-stone-600">{week.count ? formatDuration(week.minutes) : "최근 7일 동안은 아직이에요"}</p>
          </Card>
          {FEATURES.quiz && (
            <Card>
              <p className="text-xs text-stone-500">최근 확인 테스트</p>
              {quizLoading ? (
                <p className="mt-1 text-2xl font-bold">-</p>
              ) : quizError ? (
                <LoadFailed onRetry={() => quizQueries.forEach((q) => q.refetch())} />
              ) : lastQuiz ? (
                <>
                  <p className="mt-1 text-2xl font-bold tabular-nums">
                    {lastQuiz.correct} / {lastQuiz.total}
                  </p>
                  <p className="truncate text-sm text-stone-600">
                    {lastQuizName ? `${lastQuizName} · ` : ""}
                    {formatDateTime(lastQuiz.createdAt)}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-sm text-stone-600">학습을 마치고 확인 테스트를 보면 여기 나와요</p>
              )}
            </Card>
          )}
          {fbLoading ? (
            <Card>
              <p className="text-xs text-stone-500">선생님 피드백</p>
              <p className="mt-1 text-2xl font-bold">-</p>
            </Card>
          ) : fbError ? (
            <Card>
              <p className="text-xs text-stone-500">선생님 피드백</p>
              <LoadFailed onRetry={() => fbQueries.forEach((q) => q.refetch())} />
            </Card>
          ) : fb.latest ? (
            <Link to={`/student/records?session=${fb.latest.sessionId}`} className="block">
              <Card className="h-full border-brand-500 hover:bg-brand-50">
                <p className="text-xs text-stone-500">
                  선생님 피드백 <Badge tone="brand">새 피드백 {fb.count}개</Badge>
                </p>
                <p className="mt-2 line-clamp-2 text-sm">{fb.latest.content}</p>
                <p className="mt-1 text-xs text-brand-700">기록에서 보기 →</p>
              </Card>
            </Link>
          ) : (
            <Card>
              <p className="text-xs text-stone-500">선생님 피드백</p>
              <p className="mt-1 text-sm text-stone-600">최근 학습 5개에 새 피드백이 없어요</p>
            </Card>
          )}
        </div>
      )}

      <h2 className="mb-2 mt-8 font-semibold">최근 학습</h2>
      {sessions.isLoading && <Spinner />}
      {sessions.error && <ErrorState error={sessions.error} onRetry={() => sessions.refetch()} />}
      {sessions.data && recent.length === 0 && <EmptyState title="아직 끝낸 학습이 없어요" />}
      <div className="grid gap-3 sm:grid-cols-3">
        {recent.map((s) => (
          <Link key={s.id} to={`/student/records?session=${s.id}`}>
            <Card className="h-full hover:border-brand-500">
              <p className="text-xs text-stone-500">{formatDateTime(s.startedAt)}</p>
              <p className="mt-1 font-semibold">{s.goal.subject}</p>
              <p className="text-sm text-stone-600">{s.goal.activities.map(activityLabel).join(", ")}</p>
              <p className="mt-2 text-sm text-brand-700">{formatDuration(s.durationMinutes ?? 0)}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

const HOME_STALE = 60_000; // 홈과 기록을 오갈 때 같은 요청을 1분 동안 재사용

function LoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <p className="mt-1 text-sm text-stone-600">
      불러오지 못했어요.{" "}
      <button className="text-brand-700 underline" onClick={onRetry}>
        다시 시도
      </button>
    </p>
  );
}

