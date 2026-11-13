import { useState } from "react";
import { Badge, Card, ErrorState, Spinner } from "../../components/ui";
import { goalLabel } from "../../lib/checklists";
import { classifyQuestion, QUESTION_TYPE_LABEL } from "../../lib/questionType";
import { formatDateTime } from "../../lib/time";
import { countText, minutesText, pct, TypeBar, useClassAnalytics } from "./AnalyticsPage";

const PAGE = 20;

/** 학생 값 옆에 반 평균과 높고 낮음. 비교할 값이 없으면 화살표 없음 */
function Compare({ label, value, avg, format }: { label: string; value: number | null; avg: number | null; format: (v: number | null) => string }) {
  const arrow = value === null || avg === null || value === avg ? "" : value > avg ? "▲" : "▼";
  return (
    <div>
      <p className="text-xs text-stone-500">{label}</p>
      <p className="mt-0.5 text-xl font-bold tabular-nums">{format(value)}</p>
      <p className="text-xs text-stone-500">
        반 평균 {format(avg)} {arrow && <span className="text-stone-600">{arrow}</span>}
      </p>
    </div>
  );
}

/** 교사 학생 상세 위쪽: 최근 4주 종합 (반 평균과 비교, AI 질문 유형·원문) */
export function StudentProfile({ studentId }: { studentId: string }) {
  const q = useClassAnalytics("4w");
  const [shown, setShown] = useState(PAGE);
  if (q.isLoading) return <Spinner label="종합 정보를 모으는 중" />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return null;
  const { raw, summary } = q.data;
  const st = summary.students.find((s) => s.studentId === studentId);
  if (!st) return null;

  const goalOf = new Map(raw.sessions.map((s) => [s.id, goalLabel(s.goal)]));
  const questions = raw.questions
    .filter((x) => x.studentId === studentId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <Card className="mb-5">
      <h2 className="font-semibold">최근 4주 종합</h2>
      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Compare label="학습 횟수" value={st.sessionCount} avg={avg(summary.students.map((s) => s.sessionCount))} format={(v) => (v === null ? "-" : `${Math.round(v * 10) / 10}회`)} />
        <Compare label="학습 시간" value={st.minutes} avg={summary.minutes.mean} format={minutesText} />
        {st.shared && <Compare label="확인 테스트 정답률" value={st.quizRate} avg={summary.quizRate.mean} format={pct} />}
        {st.shared && <Compare label="AI 질문 수" value={st.questionCount} avg={summary.questions.mean} format={countText} />}
      </div>

      {!st.shared ? (
        <p className="mt-4 text-sm text-stone-500">기록 공유에 동의하지 않아 질문·정답률은 보이지 않아요.</p>
      ) : (
        <>
          <h3 className="mt-5 text-sm font-semibold">AI에 어떻게 물었나</h3>
          <div className="mt-2">{st.types && <TypeBar types={st.types} />}</div>
          {questions.length > 0 && (
            <>
              <h3 className="mt-5 text-sm font-semibold">AI에 한 질문 ({questions.length}개, 최근 순)</h3>
              <ul className="mt-2 divide-y divide-stone-100">
                {questions.slice(0, shown).map((x) => {
                  const t = x.questionType ?? classifyQuestion(x.content);
                  return (
                    <li key={x.id} className="flex flex-wrap items-start gap-2 py-2 text-sm">
                      <Badge tone={t === "ANSWER" ? "amber" : t === "CHECK" ? "sky" : t === "CONCEPT" ? "brand" : "stone"}>{QUESTION_TYPE_LABEL[t]}</Badge>
                      <span className="min-w-0 flex-1 break-words">{x.content}</span>
                      <span className="text-xs text-stone-400">
                        {goalOf.get(x.sessionId) ?? ""} · {formatDateTime(x.createdAt)}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {questions.length > shown && (
                <button className="mt-2 text-sm text-brand-700 hover:underline" onClick={() => setShown((n) => n + PAGE)}>
                  더 보기 ({questions.length - shown}개 남음)
                </button>
              )}
            </>
          )}
        </>
      )}
    </Card>
  );
}

function avg(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((n, v) => n + v, 0) / values.length;
}

/** 학습 목록에 붙일 세션별 AI 질문 수 (기록 공유 학생만 값이 있음) */
export function useQuestionCountBySession(studentId: string): Map<string, number> {
  const q = useClassAnalytics("4w");
  const m = new Map<string, number>();
  for (const x of q.data?.raw.questions ?? []) if (x.studentId === studentId) m.set(x.sessionId, (m.get(x.sessionId) ?? 0) + 1);
  return m;
}
