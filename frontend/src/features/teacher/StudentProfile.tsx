import { useState } from "react";
import { Icon } from "../../components/Icon";
import { Badge, Button, Card, ErrorState, Spinner } from "../../components/ui";
import { goalLabel } from "../../lib/checklists";
import { classifyQuestion, QUESTION_TYPE_LABEL } from "../../lib/questionType";
import { formatDateTime } from "../../lib/time";
import { byNewest } from "../../lib/dates";
import { countText, minutesText, pct, TypeBar, useClassAnalytics } from "./AnalyticsPage";

const PAGE = 20;

/** 학생 값 옆에 반 평균과 높고 낮음. 비교할 값이 없으면 화살표 없음 */
function Compare({ label, value, avg, format, icon, tone = "" }: { label: string; value: number | null; avg: number | null; format: (v: number | null) => string; icon: string; tone?: string }) {
  const arrow = value === null || avg === null || value === avg ? "" : value > avg ? "▲" : "▼";
  return (
    <article className={`card stat-card ${tone}`}>
      <div className="stat-head">
        <span className="stat-icon">
          <Icon name={icon} />
        </span>
        <span>{label}</span>
      </div>
      <strong className="stat-value">{format(value)}</strong>
      <p>
        반 평균 {format(avg)} {arrow && <span>{arrow}</span>}
      </p>
    </article>
  );
}

/** 교사 학생 상세 '요약' 탭: 최근 4주 숫자(반 평균 비교) + 질문 유형 비율 */
export function ProfileSummary({ studentId }: { studentId: string }) {
  const q = useClassAnalytics("4w");
  if (q.isLoading) return <Spinner label="종합 정보를 모으는 중" />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const summary = q.data?.summary;
  const st = summary?.students.find((s) => s.studentId === studentId);
  if (!summary || !st) return null;
  return (
    <>
      <div className="teacher-stats four">
        <Compare icon="book" label="학습 횟수" value={st.sessionCount} avg={avg(summary.students.map((s) => s.sessionCount))} format={(v) => (v === null ? "-" : `${Math.round(v * 10) / 10}회`)} />
        <Compare icon="clock" label="학습 시간" value={st.minutes} avg={summary.minutes.mean} format={minutesText} />
        {st.shared && <Compare icon="check" tone="blue-tone" label="확인 테스트 정답률" value={st.quizRate} avg={summary.quizRate.mean} format={pct} />}
        {st.shared && <Compare icon="message" tone="orange-tone" label="AI 질문 수" value={st.questionCount} avg={summary.questions.mean} format={countText} />}
      </div>
      <section className="card ratio-card profile-types">
        <div className="card-heading">
          <div>
            <h2>최근 4주 종합</h2>
            {st.shared && <p>AI에 어떻게 물었나</p>}
          </div>
        </div>
        {!st.shared ? (
          <p className="profile-note">기록 공유에 동의하지 않아 질문·정답률은 보이지 않아요.</p>
        ) : (
          st.types && <TypeBar types={st.types} />
        )}
      </section>
    </>
  );
}

/** 교사 학생 상세 'AI 질문' 탭: 최근 4주 질문 원문 (최근 순, 유형 배지) */
export function QuestionList({ studentId }: { studentId: string }) {
  const q = useClassAnalytics("4w");
  const [shown, setShown] = useState(PAGE);
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return null;
  const { raw, summary } = q.data;
  const st = summary.students.find((s) => s.studentId === studentId);
  if (!st) return null;
  if (!st.shared) return <Card><p className="profile-note">기록 공유에 동의하지 않아 질문은 보이지 않아요.</p></Card>;
  const goalOf = new Map(raw.sessions.map((s) => [s.id, goalLabel(s.goal)]));
  const questions = raw.questions.filter((x) => x.studentId === studentId).sort(byNewest);
  return (
    <section className="card question-list">
      <div className="card-heading">
        <div>
          <h2>AI에 한 질문 (최근 4주 {questions.length}개, 최근 순)</h2>
          <p>유형은 자동 분류 · 참고용</p>
        </div>
      </div>
      {questions.length === 0 ? (
        <p className="profile-note">AI에 한 질문이 없어요</p>
      ) : (
        <>
          <ul className="question-rows">
            {questions.slice(0, shown).map((x) => {
              const t = x.questionType ?? classifyQuestion(x.content);
              return (
                <li key={x.id} className="question-row">
                  <span>
                    <Badge tone={t === "ANSWER" ? "amber" : t === "CHECK" ? "sky" : t === "CONCEPT" ? "brand" : "stone"}>{QUESTION_TYPE_LABEL[t]}</Badge>
                  </span>
                  <strong>{x.content}</strong>
                  <small>
                    {goalOf.get(x.sessionId) ?? ""} · {formatDateTime(x.createdAt)}
                  </small>
                </li>
              );
            })}
          </ul>
          {questions.length > shown && (
            <Button variant="secondary" className="question-more" onClick={() => setShown((n) => n + PAGE)}>
              더 보기 ({questions.length - shown}개 남음)
            </Button>
          )}
        </>
      )}
    </section>
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
