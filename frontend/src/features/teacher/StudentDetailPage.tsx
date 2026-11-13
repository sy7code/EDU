import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router";
import { api, FEATURES } from "../../api";
import { Button, Card, EmptyState, ErrorState, PageTitle, Spinner } from "../../components/ui";
import { goalLabel } from "../../lib/checklists";
import { formatDateTime, formatDuration } from "../../lib/time";
import { SessionDetail } from "../records/SessionDetail";
import { TopicGrowthView } from "../records/TopicGrowthView";
import { AssessmentPanel } from "./AssessmentPanel";
import { ProfileSummary, QuestionList, useQuestionCountBySession } from "./StudentProfile";
import { studentDetailTab } from "../../lib/tabs";

const TABS = ["summary", "records", "questions"] as const;
const TAB_LABEL: Record<(typeof TABS)[number], string> = { summary: "요약", records: "학습 기록", questions: "AI 질문" };

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

  const qCount = useQuestionCountBySession(studentId);
  // ?session= 만 붙은 예전 링크는 학습 기록 탭으로, 잘못된 tab 값은 요약 탭으로
  const tab = studentDetailTab(params.get("tab"), params.get("session"));
  const go = (next: Record<string, string>) => setParams({ tab, ...(params.get("session") ? { session: params.get("session")! } : {}), ...next });
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
      <PageTitle sub={`학생이 '교사 공개'로 남긴 기록만 보여요${FEATURES.audit ? " · 열람 기록이 남아요" : ""}`}>
        {dash.data ? `${dash.data.number}번 ${dash.data.name}` : "학생 기록"}
      </PageTitle>
      <nav className="mb-4 flex gap-1 border-b border-stone-200" aria-label="학생 정보 보기">
        {TABS.map((t) => (
          <button
            key={t}
            aria-current={tab === t ? "page" : undefined}
            onClick={() => {
              setHighlight([]);
              go({ tab: t });
            }}
            className={`-mb-px border-b-2 px-4 py-2 text-sm ${tab === t ? "border-brand-500 font-semibold text-brand-700" : "border-transparent text-stone-500 hover:text-stone-700"}`}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </nav>

      {tab === "summary" && (
        <>
          <ProfileSummary studentId={studentId} />
          {FEATURES.quiz && <TopicGrowthView studentId={studentId} viewer="teacher" />}
        </>
      )}

      {tab === "questions" && <QuestionList studentId={studentId} />}

      {tab === "records" && (
        <>
          {sessions.isLoading && <Spinner />}
          {sessions.error && <ErrorState error={sessions.error} onRetry={() => sessions.refetch()} />}
          {sessions.data?.length === 0 && <EmptyState title="학습 기록이 없어요">먼저 학생과 학습 계획을 이야기해 보세요.</EmptyState>}
          {sessions.data && sessions.data.length > 0 && (
            <div className="grid gap-5 md:grid-cols-[200px_1fr] lg:grid-cols-[240px_1fr]">
              <ul className="space-y-1.5 md:sticky md:top-4 md:max-h-[80vh] md:overflow-y-auto">
                {sessions.data.map((s) => (
                  <li key={s.id}>
                    <button
                      onClick={() => go({ session: s.id })}
                      className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                        s.id === selectedId ? "border-brand-500 bg-brand-50" : "border-stone-200 bg-white hover:bg-stone-50"
                      }`}
                    >
                      <p className="text-xs text-stone-500">{formatDateTime(s.startedAt)}</p>
                      <p className="font-medium">{goalLabel(s.goal)}</p>
                      <p className="text-xs text-brand-700">
                        {s.status === "ACTIVE" ? "학습 중" : formatDuration(s.durationMinutes ?? 0)}
                        {qCount.get(s.id) ? <span className="text-stone-500"> · AI 질문 {qCount.get(s.id)}회</span> : null}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
              {selected && (
                <div className="min-w-0 space-y-4">
                  <FeedbackForm sessionId={selected.id} />
                  <SessionDetail session={selected} highlight={highlight} />
                  {FEATURES.assessment && <AssessmentPanel session={selected} onEvidence={setHighlight} />}
                </div>
              )}
            </div>
          )}
        </>
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
