import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import { useMe } from "../../auth/session";
import { Icon } from "../../components/Icon";
import { Badge, Button, EmptyState, ErrorState, Spinner } from "../../components/ui";
import { formatDateTime } from "../../lib/time";
import type { ReportedQuestion } from "../../types/domain";
import { reportCountsByStudent } from "../../lib/reportStats";

const REASON: Record<ReportedQuestion["reason"], string> = {
  WRONG_ANSWER: "정답이 이상해요",
  UNCLEAR: "문제가 이해 안 돼요",
  UNRELATED: "공부한 내용과 관계없어요",
};
const STATUS: Record<ReportedQuestion["status"], { label: string; tone: "amber" | "brand" | "stone" }> = {
  OPEN: { label: "확인 필요", tone: "amber" },
  KEEP_EXCLUDED: { label: "문항 제외함", tone: "brand" },
  DISMISSED: { label: "신고 기각 · 재채점함", tone: "stone" },
  AI_CLEARED: { label: "AI 확인 · 문제 없음", tone: "stone" },
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
  // AI가 문제 없다고 본 신고는 교사 확인 목록에서 빼고, 학생별 신고 수에만 센다
  const shown = list.data.filter((r) => r.status !== "AI_CLEARED");
  const counts = reportCountsByStudent(list.data);

  return (
    <div className="page teacher-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">확인 테스트 관리</p>
          <h1>신고된 문제</h1>
          <p>
            문항의 첫 신고는 AI가 먼저 검토해요. AI가 오류로 보거나 같은 문항이 다시 신고되면 여기로 오고, 그 문항은 일단 채점에서 빠져 있어요.
          </p>
        </div>
        {open > 0 && <Badge tone="amber">확인 필요 {open}</Badge>}
      </div>
      {list.data.length === 0 && <EmptyState title="신고된 문제가 없어요" />}
      {list.data.length > 0 && shown.length === 0 && <EmptyState title="선생님 확인이 필요한 신고가 없어요">AI가 검토해 문제 없다고 본 신고만 있어요.</EmptyState>}
      {resolve.error && <div className="mb-3"><ErrorState error={resolve.error} /></div>}
      <ul className="report-list">
        {shown.map((r) => (
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
                  <Icon name="spark" />
                  <small>AI 1차 검토</small>
                  <strong>{r.aiReview ? `${r.aiReview.verdict === "OK" ? "문제 없음" : "오류 있음"} · ${r.aiReview.reason}` : "검토 없음"}</strong>
                </span>
                <span>
                  <Icon name="alert" />
                  <small>이 문항 신고</small>
                  <strong>{r.questionReportCount === null ? "-" : `${r.questionReportCount}번`}</strong>
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
      {(counts.students.length > 0 || counts.anonymous > 0) && (
        <section className="card report-counts">
          <h2>학생별 신고 수</h2>
          <p>AI가 문제 없다고 본 신고까지 세요. 신고가 많다고 바로 문제라는 뜻은 아니에요. 문항이 실제로 헷갈렸을 수도 있어요.</p>
          <table className="overview-table">
            <thead>
              <tr>
                <th>학생</th>
                <th>신고</th>
                <th>AI가 문제 없다고 본 신고</th>
              </tr>
            </thead>
            <tbody>
              {counts.students.map((c) => (
                <tr key={c.studentNumber}>
                  <td>{c.studentNumber}번</td>
                  <td>{c.total >= 3 ? <strong className="low">{c.total}건</strong> : `${c.total}건`}</td>
                  <td>{c.aiCleared}건</td>
                </tr>
              ))}
              {counts.anonymous > 0 && (
                <tr>
                  <td>기록 비공개 학생</td>
                  <td>{counts.anonymous}건</td>
                  <td>-</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
