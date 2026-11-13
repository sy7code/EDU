import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { api, FEATURES } from "../../api";
import { useMe } from "../../auth/session";
import { Badge, Button, ErrorState, PageTitle, Spinner } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { formatDateTime, formatDuration } from "../../lib/time";
import { paginate } from "../../lib/paginate";
import { Pager } from "../../components/Pager";
import { SearchBox } from "../../components/SearchBox";
import { matchStudent } from "../../lib/studentSearch";

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
  const [query, setQuery] = useState("");
  useEffect(() => setPage(1), [filter, query]);
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
    (filter === "attention" ? r.needsAttention : filter === "active" ? r.activeNow : filter === "pending" ? r.pendingAssessment > 0 : true) &&
      matchStudent(r, query),
  );

  const paged = paginate(shown, page, 10);

  const stat = (label: string, value: string | number, key: typeof filter, icon: string, tone = "") => (
    <button
      type="button"
      onClick={() => setFilter(filter === key ? "all" : key)}
      className={`card stat-card ${tone} ${filter === key ? "selected" : ""}`}
    >
      <span className="stat-head">
        <span className="stat-icon">
          <Icon name={icon} />
        </span>
        <span>{label}</span>
      </span>
      <strong className="stat-value">{value}</strong>
    </button>
  );

  return (
    <div className="teacher-page">
      <PageTitle sub="최근 7일 · 오늘 챙길 학생을 찾는 화면이에요. 공부 방식과 분포는 '반 분석'에서 봐요">2학년 3반 자기주도학습</PageTitle>

      <div className={`teacher-stats ${FEATURES.assessment ? "four" : ""}`}>
        {stat("지금 학습 중", rows.filter((r) => r.activeNow).length, "active", "clock")}
        {stat("이야기 나눠 볼 학생", rows.filter((r) => r.needsAttention).length, "attention", "message", "orange-tone")}
        {FEATURES.assessment && stat("채점 확정 대기", rows.reduce((n, r) => n + r.pendingAssessment, 0), "pending", "check")}
        {stat("반 전체", `${rows.length}명`, "all", "users", "blue-tone")}
      </div>

      {(manualMsg || manual.error) && (
        <div
          className="fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] z-50 mx-auto max-w-lg rounded-xl bg-ink p-4 text-sm text-white shadow-lg"
          role={manual.error ? "alert" : "status"}
        >
          {manual.error ? <ErrorState error={manual.error} /> : manualMsg}
        </div>
      )}

      <div className="card table-card">
        <div className="table-title">
          <div>
            <h2>학생 학습 현황</h2>
            <p>학생별 최근 기록을 확인할 수 있어요.</p>
          </div>
          <SearchBox value={query} onChange={setQuery} />
        </div>
        <div className="table-wrap">
        <table className="overview-table">
          <thead>
            <tr>
              <th>번호</th>
              <th>이름</th>
              <th>학습</th>
              <th>시간</th>
              <th className="hidden md:table-cell">남은 질문</th>
              {FEATURES.dashboardQuizRate && <th>최근 테스트</th>}
              <th>최근</th>
              <th>상태</th>
              {FEATURES.manualAuth && <th />}
            </tr>
          </thead>
          <tbody>
            {paged.items.map((r) => (
              <tr key={r.studentId}>
                <td className="cell-muted">{r.number}</td>
                <td>
                  <Link to={`/teacher/students/${r.studentId}`}>{r.name}</Link>
                </td>
                <td>{r.sessionCount}회</td>
                <td>{formatDuration(r.totalMinutes)}</td>
                <td className="hidden md:table-cell">{r.openQuestionCount}</td>
                {FEATURES.dashboardQuizRate && (
                  <td>
                    {r.lastQuizRate === null ? "-" : r.lastQuizRate < 0.4 ? <strong className="low">{Math.round(r.lastQuizRate * 100)}%</strong> : `${Math.round(r.lastQuizRate * 100)}%`}
                  </td>
                )}
                <td className="cell-sub">{r.lastSessionAt ? formatDateTime(r.lastSessionAt) : "-"}</td>
                <td>
                  {r.activeNow && <Badge tone="brand">학습 중</Badge>}
                  {r.needsAttention && (
                    <Badge tone="amber">{r.sessionCount === 0 ? "최근 기록 없음" : "질문이 쌓임"}</Badge>
                  )}
                  {r.pendingAssessment > 0 && <Badge tone="sky">확정 {r.pendingAssessment}</Badge>}
                </td>
                {FEATURES.manualAuth && <td className="cell-right">
                  {confirmedId === r.studentId ? (
                    <span className="cell-sub"><strong>✓ 확인함</strong></span>
                  ) : (
                    <Button
                      variant="ghost"
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
        </div>
        {shown.length === 0 && (
          <p className="table-empty">
            {rows.length === 0 ? "반 학생이 없어요" : query.trim() ? "검색 결과가 없어요" : "이 조건에 맞는 학생이 없어요"}
          </p>
        )}
        <Pager page={paged.page} pageCount={paged.pageCount} onChange={setPage} />
      </div>
      <p className={`table-note ${FEATURES.manualAuth ? "" : "hidden"}`}>
        '선생님이 확인'은 얼굴 인증이나 QR을 쓰지 않는(또는 못 쓰는) 학생이 학습을 시작·종료할 때, 단말기 대신 선생님이 눈으로
        확인해 주는 기능이에요. 누르면 그 학생 기기의 인증 대기 화면이 바로 넘어가요. 누가 언제 확인했는지 기록이 남아요.
      </p>
    </div>
  );
}
