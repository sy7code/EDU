import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { api } from "../../api";
import { useMe } from "../../auth/session";
import { Icon } from "../../components/Icon";
import { Badge, EmptyState, ErrorState, Spinner } from "../../components/ui";
import { summarizeClass, type Distribution } from "../../lib/analytics";
import { QUESTION_TYPE_LABEL, type QuestionType } from "../../lib/questionType";
import { formatDuration } from "../../lib/time";
import { seoulDaysStart } from "../../lib/dates";
import { paginate } from "../../lib/paginate";
import { Pager } from "../../components/Pager";
import { SearchBox } from "../../components/SearchBox";
import { matchStudent } from "../../lib/studentSearch";

export type AnalyticsRange = "7d" | "4w";
const RANGE_DAYS: Record<AnalyticsRange, number> = { "7d": 7, "4w": 28 };
const TYPE_ORDER: QuestionType[] = ["CONCEPT", "CHECK", "ANSWER", "OTHER"];

/** 반 분석 원자료 + 집계. 반 분석 화면과 학생 프로필이 같은 캐시를 쓴다 */
export function useClassAnalytics(range: AnalyticsRange) {
  const me = useMe();
  const classId = me.data?.classId;
  return useQuery({
    queryKey: ["class-analytics", classId, range],
    enabled: !!classId,
    // 학생 상세를 오갈 때마다 반 전체를 다시 부르지 않게 5분 동안 재사용
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // 대시보드와 같은 정의: 오늘을 포함한 서울 날짜 7일/28일
      const to = new Date();
      const from = seoulDaysStart(to, RANGE_DAYS[range]);
      const raw = await api.getClassAnalytics(classId!, from, to);
      return { raw, summary: summarizeClass(raw) };
    },
  });
}

export const pct = (v: number | null) => (v === null ? "-" : `${Math.round(v * 100)}%`);
export const minutesText = (v: number | null) => (v === null ? "-" : formatDuration(Math.round(v)));
export const countText = (v: number | null) => (v === null ? "-" : `${Math.round(v * 10) / 10}회`);

function DistCard({ title, dist, format }: { title: string; dist: Distribution; format: (v: number | null) => string }) {
  const max = Math.max(1, ...dist.buckets.map((b) => b.count));
  if (dist.mean === null) {
    return (
      <div className="card distribution dist-empty">
        <h3>{title}</h3>
        <strong>-</strong>
        <p>이 기간에 기록이 없어요</p>
      </div>
    );
  }
  return (
    <div className="card distribution">
      <h3>{title}</h3>
      <div className="metrics">
        <div>
          <small>평균</small>
          <strong>{format(dist.mean)}</strong>
        </div>
        <div>
          <small>중앙값</small>
          <strong>{format(dist.median)}</strong>
        </div>
      </div>
      <div className="bar-chart" role="img" aria-label={`${title} 분포: ${dist.buckets.map((b) => `${b.label} ${b.count}명`).join(", ")}`}>
        {dist.buckets.map((b) => (
          <div key={b.label} title={`${b.label}: ${b.count}명`}>
            <span style={{ height: `${(b.count / max) * 100}%` }} />
            <small>{b.label}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 질문 유형 비율 막대 (반·학생 공용) */
export function TypeBar({ types }: { types: Record<QuestionType, number> }) {
  const total = TYPE_ORDER.reduce((n, t) => n + types[t], 0);
  if (total === 0) return <p className="empty-line">AI에 한 질문이 없어요</p>;
  return (
    <div>
      <div className="ratio-bar">
        {TYPE_ORDER.map((t) => (
          <span key={t} style={{ width: `${(types[t] / total) * 100}%` }} />
        ))}
      </div>
      <div className="ratio-legend">
        {TYPE_ORDER.map((t, i) => (
          <span key={t} className={`r${i}`}>
            <i />
            {QUESTION_TYPE_LABEL[t]} {types[t]}회 <strong>{Math.round((types[t] / total) * 100)}%</strong>
          </span>
        ))}
      </div>
      <p className="ratio-note">자동 분류 · 참고용 (AI가 나눈 값, 없으면 질문 표현으로 나눠요)</p>
    </div>
  );
}

export function AnalyticsPage() {
  const [range, setRange] = useState<AnalyticsRange>("4w");
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const q = useClassAnalytics(range);
  const nav = useNavigate();
  const found = (q.data?.summary.students ?? []).filter((s) => matchStudent(s, query));
  const paged = paginate(found, page, 10);

  return (
    <div className="teacher-page">
      <div className="page-heading">
        <div>
          <h1>반 분석</h1>
          <p>반 전체의 공부 방식과 분포를 보는 화면이에요. 순위가 아니라 대화를 시작할 단서로 써 주세요.</p>
        </div>
        <div className="segmented period period-toggle" role="group" aria-label="기간">
          {(["7d", "4w"] as const).map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={range === r}
              onClick={() => {
                setRange(r);
                setPage(1);
              }}
              className={range === r ? "active" : ""}
            >
              {r === "7d" ? "최근 7일" : "최근 4주"}
            </button>
          ))}
        </div>
      </div>

      {q.isLoading && <Spinner label="반 기록을 모으는 중" />}
      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {q.data && q.data.raw.sessions.length === 0 && <EmptyState title="이 기간에 학습 기록이 없어요">{range === "7d" ? "최근 4주로 바꿔 보세요." : "학생들이 학습을 마치면 여기에 모여요."}</EmptyState>}
      {q.data && q.data.raw.sessions.length > 0 && (
        <div className="analysis-stack">
          {q.data.summary.excludedCount > 0 && (
            <div className="privacy-note">
              <Icon name="lock" size={18} />
              <span>기록 비공개 {q.data.summary.excludedCount}명은 질문·정답률·주제 집계에서 빠져 있어요 (학습 시간은 포함).</span>
            </div>
          )}
          <div className="distribution-grid">
            <DistCard title="학습 시간 (학생당)" dist={q.data.summary.minutes} format={minutesText} />
            <DistCard title="확인 테스트 정답률" dist={q.data.summary.quizRate} format={pct} />
            <DistCard title="AI 질문 수 (학생당)" dist={q.data.summary.questions} format={countText} />
          </div>

          <div className="analysis-grid">
            <div className="card">
              <div className="card-heading">
                <div>
                  <h2>반이 공부한 주제</h2>
                </div>
              </div>
              {q.data.summary.topTopics.length === 0 ? (
                <p className="empty-line">AI가 찾은 주제가 아직 없어요</p>
              ) : (
                <div className="table-wrap">
                  <table className="topic-table">
                    <thead>
                      <tr>
                        <th>주제</th>
                        <th>공부한 학생</th>
                        <th>평균 정답률</th>
                      </tr>
                    </thead>
                    <tbody>
                      {q.data.summary.topTopics.map((t) => (
                        <tr key={t.topicId}>
                          <td>
                            <strong>{t.name}</strong>
                          </td>
                          <td>{t.studentCount}명</td>
                          <td>{pct(t.avgRate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="card">
              <div className="card-heading">
                <div>
                  <h2>AI에 어떻게 물었나 (반 전체)</h2>
                </div>
                <Badge tone="sky">자동 분류 · 참고용</Badge>
              </div>
              <TypeBar types={q.data.summary.types} />
            </div>
          </div>

          <div className="card table-card">
            <div className="table-title">
              <div>
                <h2>학생별 기록</h2>
                <p>이름을 누르면 학생 상세로 이동해요.</p>
              </div>
              <SearchBox
                value={query}
                onChange={(v) => {
                  setQuery(v);
                  setPage(1);
                }}
              />
            </div>
            <div className="table-wrap">
              <table className="overview-table">
                <thead>
                  <tr>
                    <th>번호</th>
                    <th>이름</th>
                    <th>학습 시간</th>
                    <th>정답률</th>
                    <th>AI 질문</th>
                    <th className="hidden md:table-cell">주로 한 질문</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.items.map((s) => (
                    <tr key={s.studentId} onClick={() => nav(`/teacher/students/${s.studentId}?from=analytics`)} className="clickable">
                      <td className="cell-muted">{s.number}</td>
                      <td>
                        <Link to={`/teacher/students/${s.studentId}?from=analytics`} onClick={(e) => e.stopPropagation()}>
                          {s.name}
                        </Link>
                      </td>
                      <td>{formatDuration(s.minutes)}</td>
                      {s.shared ? (
                        <>
                          <td>{pct(s.quizRate)}</td>
                          <td>{s.questionCount}회</td>
                          <td className="hidden md:table-cell">
                            {s.mainType ? <Badge tone={s.mainType === "ANSWER" ? "amber" : "stone"}>{QUESTION_TYPE_LABEL[s.mainType]}</Badge> : "-"}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="cell-muted" colSpan={2}>
                            기록 비공개
                          </td>
                          <td className="hidden md:table-cell" />
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {found.length === 0 && <p className="table-empty">{query.trim() ? "검색 결과가 없어요" : "반 학생이 없어요"}</p>}
            <Pager page={paged.page} pageCount={paged.pageCount} onChange={setPage} />
          </div>
        </div>
      )}
    </div>
  );
}
