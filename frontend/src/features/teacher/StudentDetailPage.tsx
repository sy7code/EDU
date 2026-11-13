import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router";
import { api } from "../../api";
import { Button, Card, EmptyState, ErrorState, PageTitle, Spinner } from "../../components/ui";
import { activityLabel } from "../../lib/checklists";
import { formatDateTime, formatDuration } from "../../lib/time";
import { SessionDetail } from "../records/SessionDetail";
import { AssessmentPanel } from "./AssessmentPanel";
import { StudentOverviewBoard } from "./StudentOverviewBoard";

export function StudentDetailPage() {
  const { studentId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const [highlight, setHighlight] = useState<string[]>([]);
  const sessions = useQuery({ queryKey: ["sessions", studentId], queryFn: () => api.listSessions({ studentId }) });
  const dash = useQuery({ queryKey: ["dashboard-name", studentId], queryFn: async () => {
    const me = await api.me();
    const d = await api.getDashboard(me!.classId);
    return d.students.find((s) => s.studentId === studentId) ?? null;
  } });

  const selectedId = params.get("session") ?? sessions.data?.[0]?.id;
  const selected = sessions.data?.find((s) => s.id === selectedId);

  useEffect(() => setHighlight([]), [selectedId]);
  useEffect(() => {
    if (highlight[0]) document.getElementById(`ev-${highlight[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlight]);

  return (
    <div>
      <Link to="/teacher" className="text-sm text-stone-500 hover:underline">
        ← 반 대시보드
      </Link>
      <PageTitle sub="학생이 '교사 공개'로 남긴 기록만 보여요 · 열람 기록이 남아요">
        {dash.data ? `${dash.data.number}번 ${dash.data.name}` : "학생 기록"}
      </PageTitle>
      <StudentOverviewBoard studentId={studentId} />
      {sessions.isLoading && <Spinner />}
      {sessions.error && <ErrorState error={sessions.error} onRetry={() => sessions.refetch()} />}
      {sessions.data?.length === 0 && <EmptyState title="학습 기록이 없어요">먼저 학생과 학습 계획을 이야기해 보세요.</EmptyState>}

      {sessions.data && sessions.data.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-[240px_1fr_380px]">
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
                  <p className="font-medium">{s.goal.subject} · {s.goal.activities.map(activityLabel).join(", ")}</p>
                  <p className="text-xs text-brand-700">{s.status === "ACTIVE" ? "학습 중" : formatDuration(s.durationMinutes ?? 0)}</p>
                </button>
              </li>
            ))}
          </ul>
          {selected && (
            <>
              <SessionDetail session={selected} highlight={highlight} />
              <div className="space-y-4">
                <AssessmentPanel session={selected} onEvidence={setHighlight} />
                <FeedbackForm sessionId={selected.id} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function FeedbackForm({ sessionId }: { sessionId: string }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const add = useMutation({
    mutationFn: (content: string) => api.addFeedback(sessionId, content),
    onMutate: () => setText(""),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feedback", sessionId] }),
    onError: (_e, sent) => setText((cur) => cur || sent),
  });
  return (
    <Card>
      <h3 className="font-semibold">피드백 남기기</h3>
      <p className="text-xs text-stone-500">학생의 질문과 돌아보기에 답해 주세요</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={2000}
        rows={3}
        placeholder="예: 남긴 질문 좋아요. 판별식은 다음 시간에 같이 봐요."
        className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
      />
      {add.error && <ErrorState error={add.error} />}
      <Button className="mt-2 w-full" disabled={!text.trim() || add.isPending} onClick={() => add.mutate(text)}>
        피드백 보내기
      </Button>
    </Card>
  );
}
