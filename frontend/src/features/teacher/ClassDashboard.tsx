import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { api, FEATURES } from "../../api";
import { useMe } from "../../auth/session";
import { Badge, Button, Card, ErrorState, PageTitle, Spinner } from "../../components/ui";
import { formatDateTime, formatDuration } from "../../lib/time";
import { paginate } from "../../lib/paginate";
import { Pager } from "../../components/Pager";

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
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [filter]);
  const [manualMsg, setManualMsg] = useState<string | null>(null);
  const [confirmedId, setConfirmedId] = useState<string | null>(null);
  const manual = useMutation({
    mutationFn: (studentId: string) => api.submitManualAuth(studentId),
    onSuccess: (ev) => {
      setConfirmedId(ev.studentId);
      setManualMsg(`${ev.maskedName} 학생의 학습 시작·종료를 선생님이 확인했어요. 학생 기기에서 2분 안에 이어서 진행하면 돼요.`);
    },
  });
  // 안내는 화면 아래 고정 알림으로 띄우고 6초 뒤 닫는다 (스크롤 위치와 상관없이 보이게)
  useEffect(() => {
    if (!manualMsg) return;
    const t = setTimeout(() => {
      setManualMsg(null);
      setConfirmedId(null);
    }, 6000);
    return () => clearTimeout(t);
  }, [manualMsg]);

  if (dash.error) return <ErrorState error={dash.error} onRetry={() => dash.refetch()} />;
  // 쿼리가 꺼진 순간(반 정보가 잠깐 비는 로그인·로그아웃 전환)에는 isLoading이 false라 data로 판단한다
  if (!dash.data) return <Spinner />;
  const rows = dash.data.students;
  const shown = rows.filter((r) =>
    filter === "attention" ? r.needsAttention : filter === "active" ? r.activeNow : filter === "pending" ? r.pendingAssessment > 0 : true,
  );

  const paged = paginate(shown, page, 10);

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

      <div className={`mb-5 grid grid-cols-2 gap-3 ${FEATURES.assessment ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
        {stat("지금 학습 중", rows.filter((r) => r.activeNow).length, "active")}
        {stat("이야기 나눠 볼 학생", rows.filter((r) => r.needsAttention).length, "attention")}
        {FEATURES.assessment && stat("채점 확정 대기", rows.reduce((n, r) => n + r.pendingAssessment, 0), "pending")}
        {stat("반 전체", `${rows.length}명`, "all")}
      </div>

      {(manualMsg || manual.error) && (
        <div
          className="fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] z-50 mx-auto max-w-lg rounded-xl bg-ink p-4 text-sm text-white shadow-lg"
          role={manual.error ? "alert" : "status"}
        >
          {manual.error ? <ErrorState error={manual.error} /> : manualMsg}
        </div>
      )}

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs text-stone-500">
            <tr>
              <th className="px-4 py-2.5">번호</th>
              <th className="px-4 py-2.5">이름</th>
              <th className="px-4 py-2.5">학습</th>
              <th className="px-4 py-2.5">시간</th>
              <th className="px-4 py-2.5">남은 질문</th>
              {FEATURES.dashboardQuizRate && <th className="px-4 py-2.5">최근 테스트</th>}
              <th className="px-4 py-2.5">최근</th>
              <th className="px-4 py-2.5">상태</th>
              {FEATURES.manualAuth && <th className="px-4 py-2.5" />}
            </tr>
          </thead>
          <tbody>
            {paged.items.map((r) => (
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
                {FEATURES.dashboardQuizRate && (
                  <td className={`px-4 py-2.5 tabular-nums ${r.lastQuizRate !== null && r.lastQuizRate < 0.4 ? "font-semibold text-amber-700" : ""}`}>
                    {r.lastQuizRate === null ? "-" : `${Math.round(r.lastQuizRate * 100)}%`}
                  </td>
                )}
                <td className="px-4 py-2.5 text-xs text-stone-500">{r.lastSessionAt ? formatDateTime(r.lastSessionAt) : "-"}</td>
                <td className="space-x-1 px-4 py-2.5">
                  {r.activeNow && <Badge tone="brand">학습 중</Badge>}
                  {r.needsAttention && (
                    <Badge tone="amber">{r.sessionCount === 0 ? "최근 기록 없음" : "질문이 쌓임"}</Badge>
                  )}
                  {r.pendingAssessment > 0 && <Badge tone="sky">확정 {r.pendingAssessment}</Badge>}
                </td>
                {FEATURES.manualAuth && <td className="px-4 py-2.5 text-right">
                  {confirmedId === r.studentId ? (
                    <span className="text-xs font-semibold text-brand-700">✓ 확인함</span>
                  ) : (
                    <Button
                      variant="ghost"
                      className="px-2 py-1 text-xs"
                      title="얼굴 인증·QR을 쓰지 않는 학생이 학습을 시작하거나 마칠 때, 선생님이 대신 확인해요"
                      onClick={() => manual.mutate(r.studentId)}
                      disabled={manual.isPending}
                    >
                      선생님이 확인
                    </Button>
                  )}
                </td>}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Pager page={paged.page} pageCount={paged.pageCount} onChange={setPage} />
      <p className={`mt-2 text-xs text-stone-400 ${FEATURES.manualAuth ? "" : "hidden"}`}>
        '선생님이 확인'은 얼굴 인증이나 QR을 쓰지 않는(또는 못 쓰는) 학생이 학습을 시작·종료할 때, 단말기 대신 선생님이 눈으로
        확인해 주는 기능이에요. 누르면 그 학생 기기의 인증 대기 화면이 바로 넘어가요. 누가 언제 확인했는지 기록이 남아요.
      </p>
    </div>
  );
}
