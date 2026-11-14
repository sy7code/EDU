import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { api, FEATURES } from "../../api";
import { useMe } from "../../auth/session";
import { Badge, Button, ErrorState, Spinner } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { formatDateTime, formatDuration } from "../../lib/time";
import { paginate } from "../../lib/paginate";
import { Pager } from "../../components/Pager";
import { SearchBox } from "../../components/SearchBox";
import { matchStudent } from "../../lib/studentSearch";
import { matchesFilter, type DashboardFilter } from "../../lib/dashboardFilter";
import { dashboardRowWarning } from "../../lib/insights";
import { buildStudentCsv, studentCsvFileName } from "../../lib/csv";
import { MemoWidget, ShortcutWidget } from "./DashboardWidgets";

// 날짜는 학교 기준(Asia/Seoul)으로 보여준다
const seoulMonthDay = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" });
const seoulWeekday = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", weekday: "short" });

const FILTER_LABEL: Record<DashboardFilter, string> = {
  all: "반 전체",
  active: "지금 학습 중",
  attention: "이야기 나눠 볼 학생",
  feedback: "피드백 기다림",
  pending: "채점 확정 대기",
};

type BannerItem = { filter: DashboardFilter; tag: string; title: string; desc: string };
// filter: 표를 그 조건으로 거른다 / to: 다른 화면으로 간다
type TodayItem = { label: string; text: string; action: string; count: number; filter?: DashboardFilter; to?: string };

/** 지금 보이는(거른·검색한) 학생 표를 CSV 파일로 내려받는다 */
function downloadCsv(rows: Parameters<typeof buildStudentCsv>[0]) {
  const csv = buildStudentCsv(rows, { quizRate: FEATURES.dashboardQuizRate });
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = studentCsvFileName(new Date());
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 바로 풀면 일부 브라우저에서 내려받기가 취소된다
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function ClassDashboard() {
  const me = useMe();
  const classId = me.data?.classId ?? "";
  const dash = useQuery({
    queryKey: ["dashboard", classId],
    queryFn: () => api.getDashboard(classId),
    enabled: !!classId,
    refetchInterval: 5000, // 실서비스: Realtime 구독
  });
  // 오늘 칸의 '최근 신고' (신고된 문제 화면과 같은 캐시)
  const reports = useQuery({
    queryKey: ["reports", classId],
    queryFn: () => api.listReportedQuestions(classId),
    enabled: FEATURES.quiz && !!classId,
  });
  const [filter, setFilter] = useState<DashboardFilter>("all");
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  useEffect(() => setPage(1), [filter, query]);
  const [bannerIdx, setBannerIdx] = useState(0);
  const tableRef = useRef<HTMLDivElement>(null);
  const tableTitleRef = useRef<HTMLHeadingElement>(null);
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
  const shown = rows.filter((r) => matchesFilter(r, filter) && matchStudent(r, query));

  const paged = paginate(shown, page, 10);
  const avgSessions = rows.length ? rows.reduce((n, r) => n + r.sessionCount, 0) / rows.length : null;
  const topWarn = (r: (typeof rows)[number]) => dashboardRowWarning(r, avgSessions);

  const activeRows = rows.filter((r) => r.activeNow);
  const attentionCount = rows.filter((r) => r.needsAttention).length;
  const feedbackCount = rows.filter((r) => r.hasReflectionWithoutFeedback).length;
  const pendingCount = rows.reduce((n, r) => n + r.pendingAssessment, 0);

  // 배너·오늘 칸의 버튼: 그 조건으로 표를 거르고 표로 내려간다
  const showFilter = (key: DashboardFilter) => {
    setFilter(key);
    tableRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    // 키보드·화면 읽기 사용자도 거른 표로 옮겨 간다
    tableTitleRef.current?.focus({ preventScroll: true });
  };

  // 배너는 실제 숫자가 있는 항목만 보여주고, 자동으로 넘기지 않는다
  const bannerItems: BannerItem[] = [];
  if (feedbackCount > 0)
    bannerItems.push({
      filter: "feedback",
      tag: "피드백",
      title: `돌아보기 피드백을 기다리는 학생 ${feedbackCount}명`,
      desc: "학생이 학습을 마치고 선생님의 한마디를 기다리고 있어요.",
    });
  if (attentionCount > 0)
    bannerItems.push({
      filter: "attention",
      tag: "대화",
      title: `이야기 나눠 볼 학생 ${attentionCount}명`,
      desc: "질문이 쌓였거나 최근 학습 기록이 없는 학생이에요.",
    });
  if (FEATURES.assessment && pendingCount > 0)
    bannerItems.push({
      filter: "pending",
      tag: "채점",
      title: `채점 확정을 기다리는 기록 ${pendingCount}건`,
      desc: "확정 전인 채점 결과가 있어요.",
    });
  const bannerCount = bannerItems.length;
  const bannerAt = bannerCount ? bannerIdx % bannerCount : 0;
  const banner = bannerItems[bannerAt];

  const today = new Date();
  const period = `${seoulMonthDay.format(new Date(dash.data.from))}–${seoulMonthDay.format(new Date(dash.data.to))}`;
  const activeNames = activeRows
    .slice(0, 3)
    .map((r) => r.name)
    .join(", ");

  const todayItems: TodayItem[] = [
    {
      label: "지금 학습 중",
      text: activeRows.length
        ? `${activeNames}${activeRows.length > 3 ? ` 외 ${activeRows.length - 3}명` : ""} 학생이 학습하고 있어요.`
        : "지금 학습 중인 학생이 없어요.",
      action: "학생 보기",
      filter: "active",
      count: activeRows.length,
    },
    {
      label: "피드백 기다림",
      text: feedbackCount ? `학생 ${feedbackCount}명의 돌아보기가 기다리고 있어요.` : "기다리는 돌아보기가 없어요.",
      action: "피드백 보기",
      filter: "feedback",
      count: feedbackCount,
    },
    {
      label: "이야기 나눠 볼 학생",
      text: attentionCount ? `${attentionCount}명에게 먼저 말을 걸어 보세요.` : "지금은 따로 챙길 학생이 없어요.",
      action: "학생 보기",
      filter: "attention",
      count: attentionCount,
    },
  ];
  const openReports = reports.data?.filter((r) => r.status === "OPEN").length ?? 0;
  if (FEATURES.quiz && openReports > 0)
    todayItems.splice(1, 0, {
      label: "최근 신고",
      text: `검토가 필요한 신고가 ${openReports}건 있어요.`,
      action: "신고 보기",
      to: "/teacher/reports",
      count: openReports,
    });

  const stat = (label: string, value: string, note: string, key: DashboardFilter, icon: string, tone = "") => (
    <button
      type="button"
      onClick={() => setFilter(filter === key ? "all" : key)}
      aria-pressed={filter === key}
      className={`card stat-card ${tone} ${filter === key ? "selected" : ""}`}
    >
      <span className="stat-head">
        <span className="stat-icon">
          <Icon name={icon} />
        </span>
        <span>{label}</span>
      </span>
      <strong className="stat-value">{value}</strong>
      <span className="dash-stat-note">{note}</span>
    </button>
  );

  return (
    <div className="teacher-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">최근 7일 · {period}</p>
          <h1>2학년 3반 자기주도학습</h1>
          <p>오늘 챙길 학생을 찾는 화면이에요. 공부 방식과 분포는 '반 분석'에서 봐요.</p>
        </div>
        <Button
          variant="secondary"
          className="dash-download"
          onClick={() => downloadCsv(shown)}
          disabled={shown.length === 0}
          title={filter === "all" && !query.trim() ? "반 전체 학생 표를 CSV 파일로 내려받아요" : "지금 거른 학생만 CSV 파일로 내려받아요"}
        >
          학습 현황 내려받기
        </Button>
      </div>

      <section className="dashboard-banner dash-banner" aria-label="오늘 먼저 확인할 일">
        {banner ? (
          <>
            <div>
              <span aria-hidden="true">{banner.tag}</span>
              <small>오늘 먼저 확인해 보세요</small>
              <h2>{banner.title}</h2>
              <p>{banner.desc}</p>
            </div>
            <button type="button" onClick={() => showFilter(banner.filter)}>
              확인하기 <Icon name="chevron" size={16} />
            </button>
            {bannerCount > 1 && (
              <div className="banner-dots">
                <button
                  type="button"
                  className="dash-banner-nav"
                  aria-label="이전 알림"
                  onClick={() => setBannerIdx((bannerAt - 1 + bannerCount) % bannerCount)}
                >
                  ‹
                </button>
                {bannerItems.map((b, i) => (
                  <i key={b.filter} className={i === bannerAt ? "active" : ""} aria-hidden="true" />
                ))}
                <small aria-live="polite">
                  {bannerAt + 1} / {bannerCount}
                </small>
                <button
                  type="button"
                  className="dash-banner-nav"
                  aria-label="다음 알림"
                  onClick={() => setBannerIdx((bannerAt + 1) % bannerCount)}
                >
                  ›
                </button>
              </div>
            )}
          </>
        ) : (
          <div>
            <small>오늘 먼저 확인해 보세요</small>
            <h2>지금 먼저 챙길 일이 없어요</h2>
            <p>피드백을 기다리거나 이야기 나눠 볼 학생이 생기면 여기에 알려 드려요.</p>
          </div>
        )}
      </section>

      <div className="dashboard-columns dash-columns">
        <div className="dashboard-main">
          <section className="card care-widget">
            <div className="card-heading">
              <div>
                <h2>챙길 학생</h2>
                <p>카드를 누르면 아래 표에서 그 학생만 볼 수 있어요.</p>
              </div>
            </div>
            <div className={`care-tiles ${FEATURES.assessment ? "dash-tiles-five" : ""}`}>
              {stat("지금 학습 중", `${activeRows.length}명`, `반 ${rows.length}명 중`, "active", "clock")}
              {stat("이야기 나눠 볼 학생", `${attentionCount}명`, "질문이 쌓였거나 기록이 없어요", "attention", "message", "attention")}
              {stat("피드백 기다림", `${feedbackCount}명`, "돌아보기를 남긴 학생", "feedback", "pen")}
              {FEATURES.assessment && stat("채점 확정 대기", `${pendingCount}건`, "확정 전 채점 결과", "pending", "check")}
              {stat("반 전체", `${rows.length}명`, "모든 학생 보기", "all", "users", "blue-tone")}
            </div>
          </section>
          <div className="small-widget-grid dash-widgets">
            <ShortcutWidget feedbackCount={feedbackCount} onFeedback={() => showFilter("feedback")} />
            {me.data && <MemoWidget teacherId={me.data.id} />}
          </div>
        </div>

        <aside className="today-rail card" aria-label="오늘">
          <div className="today-date">
            <span>
              {seoulMonthDay.format(today)} <small>({seoulWeekday.format(today)})</small>
            </span>
            <Badge>오늘</Badge>
          </div>
          {todayItems.map((item, i) => (
            <div className="today-item" key={item.label}>
              <span className={`schedule-dot d${i}`} aria-hidden="true" />
              <div>
                <strong>{item.label}</strong>
                <p>{item.text}</p>
              </div>
              {item.count > 0 &&
                (item.to ? (
                  <Link to={item.to} className="dash-today-link" aria-label={`${item.label} ${item.action}`}>
                    {item.action}
                  </Link>
                ) : (
                  <button type="button" aria-label={`${item.label} ${item.action}`} onClick={() => item.filter && showFilter(item.filter)}>
                    {item.action}
                  </button>
                ))}
            </div>
          ))}
        </aside>
      </div>

      {(manualMsg || manual.error) && (
        <div
          className="fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] z-50 mx-auto max-w-lg rounded-xl bg-ink p-4 text-sm text-white shadow-lg"
          role={manual.error ? "alert" : "status"}
        >
          {manual.error ? <ErrorState error={manual.error} /> : manualMsg}
        </div>
      )}

      <div className="card table-card dash-table-card" ref={tableRef}>
        <div className="table-title">
          <div>
            <h2 ref={tableTitleRef} tabIndex={-1}>
              학생 학습 현황
            </h2>
            <p>학생별 최근 기록을 확인할 수 있어요.</p>
          </div>
          <div className="filter-row">
            {filter !== "all" && (
              <button type="button" className="dash-filter-chip" onClick={() => setFilter("all")}>
                {FILTER_LABEL[filter]}만 보는 중 · 전체 보기
              </button>
            )}
            <SearchBox value={query} onChange={setQuery} />
          </div>
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
                  {r.hasReflectionWithoutFeedback && <Badge tone="sky">피드백 기다림</Badge>}
                  {r.pendingAssessment > 0 && <Badge tone="sky">확정 {r.pendingAssessment}</Badge>}
                  {(() => {
                    const w = topWarn(r);
                    return w ? (
                      <small className="row-insight" title={w.action ? `${w.evidence} → ${w.action}` : w.evidence}>
                        {w.text} · {w.evidence}
                      </small>
                    ) : null;
                  })()}
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
