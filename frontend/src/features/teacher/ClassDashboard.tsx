import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { api } from "../../api";
import { useMe } from "../../auth/session";
import { Badge, Button, Card, ErrorState, PageTitle, Spinner } from "../../components/ui";
import { formatDateTime, formatDuration } from "../../lib/time";

export function ClassDashboard() {
  const me = useMe();
  const classId = me.data?.classId ?? "";
  const dash = useQuery({
    queryKey: ["dashboard", classId],
    queryFn: () => api.getDashboard(classId),
    enabled: !!classId,
    refetchInterval: 5000, // 실서비스: Realtime 구독
  });
  const [filter, setFilter] = useState<"all" | "attention" | "active" | "pending">("all");
  const [manualMsg, setManualMsg] = useState<string | null>(null);
  const manual = useMutation({
    mutationFn: (studentId: string) => api.submitManualAuth(studentId),
    onSuccess: (ev) => setManualMsg(`${ev.maskedName} 학생을 확인했어요. 학생 기기에서 2분 안에 이어서 진행할 수 있어요.`),
  });

  if (dash.isLoading || me.isLoading) return <Spinner />;
  if (dash.error) return <ErrorState error={dash.error} onRetry={() => dash.refetch()} />;
  const rows = dash.data!.students;
  const shown = rows.filter((r) =>
    filter === "attention" ? r.needsAttention : filter === "active" ? r.activeNow : filter === "pending" ? r.pendingAssessment > 0 : true,
  );

  const stat = (label: string, value: string | number, key: typeof filter) => (
    <button
      onClick={() => setFilter(filter === key ? "all" : key)}
      className={`rounded-xl border bg-white p-4 text-left ${filter === key ? "border-brand-500 ring-1 ring-brand-500" : "border-stone-200"}`}
    >
      <p className="text-xs text-stone-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </button>
  );

  return (
    <div>
      <PageTitle sub="최근 7일 · 기록 시간은 평가 점수가 아니라 대화의 출발점이에요">2학년 3반 자기주도학습</PageTitle>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stat("지금 학습 중", rows.filter((r) => r.activeNow).length, "active")}
        {stat("이야기 나눠 볼 학생", rows.filter((r) => r.needsAttention).length, "attention")}
        {stat("채점 확정 대기", rows.reduce((n, r) => n + r.pendingAssessment, 0), "pending")}
        {stat("반 전체", `${rows.length}명`, "all")}
      </div>

      {manualMsg && (
        <div className="mb-3 rounded-lg bg-brand-50 p-3 text-sm text-brand-700" role="status">
          {manualMsg}
        </div>
      )}
      {manual.error && <div className="mb-3"><ErrorState error={manual.error} /></div>}

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs text-stone-500">
            <tr>
              <th className="px-4 py-2.5">번호</th>
              <th className="px-4 py-2.5">이름</th>
              <th className="px-4 py-2.5">학습</th>
              <th className="px-4 py-2.5">시간</th>
              <th className="px-4 py-2.5">남은 질문</th>
              <th className="px-4 py-2.5">최근</th>
              <th className="px-4 py-2.5">상태</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.studentId} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                <td className="px-4 py-2.5 text-stone-500">{r.number}</td>
                <td className="px-4 py-2.5 font-medium">
                  <Link to={`/teacher/students/${r.studentId}`} className="hover:text-brand-700 hover:underline">
                    {r.name}
                  </Link>
                </td>
                <td className="px-4 py-2.5 tabular-nums">{r.sessionCount}회</td>
                <td className="px-4 py-2.5 tabular-nums">{formatDuration(r.totalMinutes)}</td>
                <td className="px-4 py-2.5 tabular-nums">{r.openQuestionCount}</td>
                <td className="px-4 py-2.5 text-xs text-stone-500">{r.lastSessionAt ? formatDateTime(r.lastSessionAt) : "-"}</td>
                <td className="space-x-1 px-4 py-2.5">
                  {r.activeNow && <Badge tone="brand">학습 중</Badge>}
                  {r.needsAttention && (
                    <Badge tone="amber">{r.sessionCount === 0 ? "최근 기록 없음" : "질문이 쌓임"}</Badge>
                  )}
                  {r.pendingAssessment > 0 && <Badge tone="sky">확정 {r.pendingAssessment}</Badge>}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => manual.mutate(r.studentId)} disabled={manual.isPending}>
                    수기 확인
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="mt-2 text-xs text-stone-400">
        '수기 확인'은 얼굴 인증·기기를 쓰지 않는 학생의 학습 시작·종료를 선생님이 직접 확인하는 기능이에요. 확인 기록은 남아요.
      </p>
    </div>
  );
}
