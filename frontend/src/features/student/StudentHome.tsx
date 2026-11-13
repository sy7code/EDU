import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { api } from "../../api";
import { useMe } from "../../auth/session";
import { Badge, ButtonLink, Card, EmptyState, ErrorState, PageTitle, Spinner } from "../../components/ui";
import { activityLabel, goalLabel } from "../../lib/checklists";
import { elapsedLabel, formatDateTime, formatDuration } from "../../lib/time";

export function StudentHome() {
  const me = useMe();
  const active = useQuery({ queryKey: ["active-session"], queryFn: () => api.getActiveSession() });
  const sessions = useQuery({ queryKey: ["sessions", "me"], queryFn: () => api.listSessions({}) });

  const recent = (sessions.data ?? []).filter((s) => s.status === "ENDED").slice(0, 3);

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
