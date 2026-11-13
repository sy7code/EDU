import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import { useMe } from "../../auth/session";
import { Badge, Button, Card, EmptyState, ErrorState, PageTitle, Spinner } from "../../components/ui";
import { formatDateTime } from "../../lib/time";
import type { ReportedQuestion } from "../../types/domain";

const REASON: Record<ReportedQuestion["reason"], string> = {
  WRONG_ANSWER: "정답이 이상해요",
  UNCLEAR: "문제가 이해 안 돼요",
  UNRELATED: "공부한 내용과 관계없어요",
};
const STATUS: Record<ReportedQuestion["status"], { label: string; tone: "amber" | "brand" | "stone" }> = {
  OPEN: { label: "확인 필요", tone: "amber" },
  KEEP_EXCLUDED: { label: "문항 제외함", tone: "brand" },
  DISMISSED: { label: "신고 기각 · 재채점함", tone: "stone" },
};

/** AI가 만든 문항을 미리 검토하는 사람이 없으므로, 학생 신고를 교사가 사후에 판단한다 */
export function ReportsPage() {
  const me = useMe();
  const qc = useQueryClient();
  const classId = me.data?.classId ?? "";
  const list = useQuery({ queryKey: ["reports", classId], queryFn: () => api.listReportedQuestions(classId), enabled: !!classId });
  const resolve = useMutation({
    mutationFn: (v: { id: string; action: "KEEP_EXCLUDED" | "DISMISS" }) => api.resolveReport(v.id, v.action),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reports"] });
      qc.invalidateQueries({ queryKey: ["topic-growth"] });
      qc.invalidateQueries({ queryKey: ["quiz-attempt"] });
    },
  });

  if (list.error) return <ErrorState error={list.error} onRetry={() => list.refetch()} />;
  if (!list.data) return <Spinner />;
  const open = list.data.filter((r) => r.status === "OPEN").length;

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle sub="학생이 확인 테스트 중 '이 문제 이상해요'로 신고한 AI 생성 문항이에요. 신고한 문항은 일단 채점에서 빠져 있어요.">
        신고된 문제 {open > 0 && <Badge tone="amber">확인 필요 {open}</Badge>}
      </PageTitle>
      {list.data.length === 0 && <EmptyState title="신고된 문제가 없어요" />}
      {resolve.error && <div className="mb-3"><ErrorState error={resolve.error} /></div>}
      <ul className="space-y-3">
        {list.data.map((r) => (
          <li key={r.reportId}>
            <Card>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                <Badge tone="sky">{r.topicName}</Badge>
                <span className="text-stone-500">
                  {r.studentNumber}번 학생 · {REASON[r.reason]} · {formatDateTime(r.createdAt)}
                </span>
                {r.studentReportCount >= 3 && <Badge tone="amber">이 학생 신고 {r.studentReportCount}건</Badge>}
              </div>
              <p className="mt-2 font-medium">{r.prompt}</p>
              <ol className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                {r.choices.map((c, i) => (
                  <li key={i} className={i === r.answerIndex ? "font-semibold text-brand-700" : "text-stone-600"}>
                    {i === r.answerIndex ? "✓ " : `${i + 1}. `}
                    {c}
                  </li>
                ))}
              </ol>
              <p className="mt-2 text-sm text-stone-500">해설: {r.explanation}</p>
              {r.status === "OPEN" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button className="px-3 py-1.5 text-xs" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: r.reportId, action: "KEEP_EXCLUDED" })}>
                    문항이 잘못됐어요 · 앞으로 제외
                  </Button>
                  <Button variant="secondary" className="px-3 py-1.5 text-xs" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: r.reportId, action: "DISMISS" })}>
                    문항은 괜찮아요 · 신고 기각(재채점)
                  </Button>
                </div>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
