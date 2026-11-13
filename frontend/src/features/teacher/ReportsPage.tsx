import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import { useMe } from "../../auth/session";
import { Icon } from "../../components/Icon";
import { Badge, Button, EmptyState, ErrorState, Spinner } from "../../components/ui";
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
    <div className="page teacher-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">확인 테스트 관리</p>
          <h1>신고된 문제</h1>
          <p>학생이 확인 테스트 중 '이 문제 이상해요'로 신고한 AI 생성 문항이에요. 신고한 문항은 일단 채점에서 빠져 있어요.</p>
        </div>
        {open > 0 && <Badge tone="amber">확인 필요 {open}</Badge>}
      </div>
      {list.data.length === 0 && <EmptyState title="신고된 문제가 없어요" />}
      {resolve.error && <div className="mb-3"><ErrorState error={resolve.error} /></div>}
      <ul className="report-list">
        {list.data.map((r) => (
          <li key={r.reportId}>
            <article className="card report-card">
              <div className="report-head">
                <div>
                  <Badge tone="sky">{r.topicName}</Badge>
                  <small>{formatDateTime(r.createdAt)}</small>
                </div>
                <div>
                  {r.studentReportCount !== null && r.studentReportCount >= 3 && <Badge tone="amber">이 학생 신고 {r.studentReportCount}건</Badge>}
                  <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                </div>
              </div>
              <h2>{r.prompt}</h2>
              <div className="answer-box">
                <ol className="choices">
                  {r.choices.map((c, i) => (
                    <li key={i} className={i === r.answerIndex ? "correct" : undefined}>
                      {i === r.answerIndex ? "✓ " : `${i + 1}. `}
                      {c}
                    </li>
                  ))}
                </ol>
                <p>해설: {r.explanation}</p>
              </div>
              <div className="report-meta">
                <span>
                  <Icon name="alert" />
                  <small>신고 이유</small>
                  <strong>{REASON[r.reason]}</strong>
                </span>
                <span>
                  <Icon name={r.studentNumber === null ? "lock" : "users"} />
                  <small>신고 학생</small>
                  <strong>{r.studentNumber === null ? "학생(기록 비공개)" : `${r.studentNumber}번 학생`}</strong>
                </span>
              </div>
              {r.status === "OPEN" && (
                <div className="report-actions">
                  <Button variant="secondary" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: r.reportId, action: "KEEP_EXCLUDED" })}>
                    문항이 잘못됐어요 · 앞으로 제외
                  </Button>
                  <Button disabled={resolve.isPending} onClick={() => resolve.mutate({ id: r.reportId, action: "DISMISS" })}>
                    문항은 괜찮아요 · 신고 기각(재채점)
                  </Button>
                </div>
              )}
            </article>
          </li>
        ))}
      </ul>
    </div>
  );
}
