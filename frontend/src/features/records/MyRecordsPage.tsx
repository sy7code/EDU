import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { api, FEATURES } from "../../api";
import { useMe } from "../../auth/session";
import { TopicGrowthView } from "./TopicGrowthView";
import { Card, EmptyState, ErrorState, PageTitle, Spinner } from "../../components/ui";
import { goalLabel } from "../../lib/checklists";
import { formatDateTime, formatDuration } from "../../lib/time";
import { SessionDetail } from "./SessionDetail";
import { AssessmentView } from "../teacher/AssessmentPanel";

export function MyRecordsPage() {
  const [params, setParams] = useSearchParams();
  const me = useMe();
  const sessions = useQuery({ queryKey: ["sessions", "me"], queryFn: () => api.listSessions({}) });
  const selectedId = params.get("session") ?? sessions.data?.[0]?.id;
  const selected = sessions.data?.find((s) => s.id === selectedId);
  const totalMin = (sessions.data ?? []).reduce((n, s) => n + (s.durationMinutes ?? 0), 0);

  return (
    <div>
      <PageTitle sub={sessions.data ? `지금까지 ${sessions.data.length}번, ${formatDuration(totalMin)} 스스로 공부했어요` : undefined}>
        내 학습 기록
      </PageTitle>
      {FEATURES.quiz && me.data && <TopicGrowthView studentId={me.data.id} viewer="student" />}
      {sessions.isLoading && <Spinner />}
      {sessions.error && <ErrorState error={sessions.error} onRetry={() => sessions.refetch()} />}
      {sessions.data?.length === 0 && <EmptyState title="아직 기록이 없어요">홈에서 첫 학습을 시작해 보세요.</EmptyState>}
      {sessions.data && sessions.data.length > 0 && (
        <div className="grid gap-5 md:grid-cols-[260px_1fr]">
          <ul className="space-y-1.5">
            {sessions.data.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => setParams({ session: s.id })}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                    s.id === selectedId ? "border-brand-500 bg-brand-50" : "border-stone-200 bg-white hover:bg-stone-50"
                  }`}
                >
                  <p className="text-xs text-stone-500">{formatDateTime(s.startedAt)}</p>
                  <p className="font-medium">
                    {goalLabel(s.goal)}
                  </p>
                  <p className="text-xs text-brand-700">{s.status === "ACTIVE" ? "학습 중" : formatDuration(s.durationMinutes ?? 0)}</p>
                </button>
              </li>
            ))}
          </ul>
          {selected && (
            <div className="space-y-4">
              <SessionDetail session={selected} />
              <StudentAssessment sessionId={selected.id} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StudentAssessment({ sessionId }: { sessionId: string }) {
  const a = useQuery({ queryKey: ["assessment", sessionId], queryFn: () => api.getAssessment(sessionId) });
  if (!a.data?.teacher) return null;
  return (
    <Card>
      <h3 className="font-semibold">선생님 관찰 평가</h3>
      <p className="text-xs text-stone-500">선생님이 확정한 내용이에요</p>
      <AssessmentView sessionId={sessionId} scores={a.data.teacher} />
    </Card>
  );
}
