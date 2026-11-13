import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { api } from "../../api";
import { useMe } from "../../auth/session";
import { Badge, Card, EmptyState, ErrorState, PageTitle, Spinner } from "../../components/ui";
import { summarizeClass, type Distribution } from "../../lib/analytics";
import { QUESTION_TYPE_LABEL, type QuestionType } from "../../lib/questionType";
import { formatDuration } from "../../lib/time";

export type AnalyticsRange = "7d" | "4w";
const RANGE_DAYS: Record<AnalyticsRange, number> = { "7d": 7, "4w": 28 };
const TYPE_ORDER: QuestionType[] = ["CONCEPT", "CHECK", "ANSWER", "OTHER"];
const TYPE_COLOR: Record<QuestionType, string> = {
  CONCEPT: "bg-brand-500",
  CHECK: "bg-sky-500",
  ANSWER: "bg-amber-500",
  OTHER: "bg-stone-300",
};

/** 반 분석 원자료 + 집계. 반 분석 화면과 학생 프로필이 같은 캐시를 쓴다 */
export function useClassAnalytics(range: AnalyticsRange) {
  const me = useMe();
  const classId = me.data?.classId;
  return useQuery({
    queryKey: ["class-analytics", classId, range],
    enabled: !!classId,
    queryFn: async () => {
      const to = new Date();
      const from = new Date(to.getTime() - RANGE_DAYS[range] * 86400000);
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
  return (
    <Card>
      <p className="text-xs text-stone-500">{title}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{format(dist.mean)}</p>
      <p className="text-xs text-stone-500">평균 · 중앙값 {format(dist.median)}</p>
      <div className="mt-3 flex h-16 items-end gap-1" aria-label={`${title} 분포`}>
        {dist.buckets.map((b) => (
          <div key={b.label} className="flex flex-1 flex-col items-center justify-end" title={`${b.label}: ${b.count}명`}>
            <span className="text-[10px] tabular-nums text-stone-500">{b.count}</span>
            <div className="w-full rounded-t bg-brand-500/60" style={{ height: `${(b.count / max) * 44}px` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1">
        {dist.buckets.map((b) => (
          <span key={b.label} className="flex-1 text-center text-[10px] leading-tight text-stone-400">
            {b.label}
          </span>
        ))}
      </div>
    </Card>
  );
}

/** 질문 유형 비율 막대 (반·학생 공용) */
export function TypeBar({ types }: { types: Record<QuestionType, number> }) {
  const total = TYPE_ORDER.reduce((n, t) => n + types[t], 0);
  if (total === 0) return <p className="text-sm text-stone-500">AI에 한 질문이 없어요</p>;
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-stone-100">
        {TYPE_ORDER.filter((t) => types[t] > 0).map((t) => (
          <div key={t} className={TYPE_COLOR[t]} style={{ width: `${(types[t] / total) * 100}%` }} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-600">
        {TYPE_ORDER.map((t) => (
          <span key={t} className="flex items-center gap-1">
            <span className={`inline-block h-2 w-2 rounded-full ${TYPE_COLOR[t]}`} />
            {QUESTION_TYPE_LABEL[t]} {types[t]}회 ({Math.round((types[t] / total) * 100)}%)
          </span>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-stone-400">자동 분류 · 참고용 (질문 문장의 표현으로 나눠요)</p>
    </div>
  );
}

export function AnalyticsPage() {
  const [range, setRange] = useState<AnalyticsRange>("4w");
  const q = useClassAnalytics(range);
  const nav = useNavigate();

  return (
    <div>
      <PageTitle sub="반 전체의 흐름을 보는 화면이에요. 순위가 아니라 대화를 시작할 단서로 써 주세요.">반 분석</PageTitle>
      <div className="mb-4 flex gap-2" role="radiogroup" aria-label="기간">
        {(["7d", "4w"] as const).map((r) => (
          <button
            key={r}
            role="radio"
            aria-checked={range === r}
            onClick={() => setRange(r)}
            className={`rounded-lg border px-3 py-1.5 text-sm ${range === r ? "border-brand-500 bg-brand-50 font-semibold text-brand-700" : "border-stone-300"}`}
          >
            {r === "7d" ? "최근 7일" : "최근 4주"}
          </button>
        ))}
      </div>

      {q.isLoading && <Spinner label="반 기록을 모으는 중" />}
      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {q.data && q.data.raw.sessions.length === 0 && <EmptyState title="이 기간에 학습 기록이 없어요">기간을 늘려 보세요.</EmptyState>}
      {q.data && q.data.raw.sessions.length > 0 && (
        <div className="space-y-4">
          {q.data.summary.excludedCount > 0 && (
            <p className="text-sm text-stone-500">기록 비공개 {q.data.summary.excludedCount}명은 질문·정답률 집계에서 빠져 있어요 (학습 시간은 포함).</p>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <DistCard title="학습 시간 (학생당)" dist={q.data.summary.minutes} format={minutesText} />
            <DistCard title="확인 테스트 정답률" dist={q.data.summary.quizRate} format={pct} />
            <DistCard title="AI 질문 수 (학생당)" dist={q.data.summary.questions} format={countText} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Card>
              <h2 className="font-semibold">반이 공부한 주제</h2>
              {q.data.summary.topTopics.length === 0 ? (
                <p className="mt-2 text-sm text-stone-500">AI가 찾은 주제가 아직 없어요</p>
              ) : (
                <table className="mt-2 w-full text-sm">
                  <thead className="text-left text-xs text-stone-500">
                    <tr>
                      <th className="py-1">주제</th>
                      <th className="py-1">공부한 학생</th>
                      <th className="py-1">평균 정답률</th>
                    </tr>
                  </thead>
                  <tbody>
                    {q.data.summary.topTopics.map((t) => (
                      <tr key={t.topicId} className="border-t border-stone-100">
                        <td className="py-1.5 font-medium">{t.name}</td>
                        <td className="py-1.5 tabular-nums">{t.studentCount}명</td>
                        <td className="py-1.5 tabular-nums">{pct(t.avgRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
            <Card>
              <h2 className="font-semibold">AI에 어떻게 물었나 (반 전체)</h2>
              <div className="mt-3">
                <TypeBar types={q.data.summary.types} />
              </div>
            </Card>
          </div>

          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs text-stone-500">
                <tr>
                  <th className="px-4 py-2.5">번호</th>
                  <th className="px-4 py-2.5">이름</th>
                  <th className="px-4 py-2.5">학습 시간</th>
                  <th className="px-4 py-2.5">정답률</th>
                  <th className="px-4 py-2.5">AI 질문</th>
                  <th className="px-4 py-2.5">주로 한 질문</th>
                </tr>
              </thead>
              <tbody>
                {q.data.summary.students.map((s) => (
                  <tr
                    key={s.studentId}
                    onClick={() => nav(`/teacher/students/${s.studentId}`)}
                    className="cursor-pointer border-b border-stone-100 last:border-0 hover:bg-stone-50"
                  >
                    <td className="px-4 py-2.5 text-stone-500">{s.number}</td>
                    <td className="px-4 py-2.5 font-medium">
                      <Link to={`/teacher/students/${s.studentId}`} className="hover:text-brand-700 hover:underline" onClick={(e) => e.stopPropagation()}>
                        {s.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">{formatDuration(s.minutes)}</td>
                    {s.shared ? (
                      <>
                        <td className="px-4 py-2.5 tabular-nums">{pct(s.quizRate)}</td>
                        <td className="px-4 py-2.5 tabular-nums">{s.questionCount}회</td>
                        <td className="px-4 py-2.5">
                          {s.mainType ? <Badge tone={s.mainType === "ANSWER" ? "amber" : "stone"}>{QUESTION_TYPE_LABEL[s.mainType]}</Badge> : "-"}
                        </td>
                      </>
                    ) : (
                      <td className="px-4 py-2.5 text-stone-400" colSpan={3}>
                        기록 비공개
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </div>
  );
}
