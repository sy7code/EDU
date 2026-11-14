import { useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../api";
import { useHasConsent } from "../../auth/session";
import { Badge, Button, ErrorState, Spinner } from "../../components/ui";
import { Icon } from "../../components/Icon";
import type { QuizAttempt, QuizReportOutcome, QuizReportReason, SessionTopic, StudentQuizQuestion } from "../../types/domain";

export const QUIZ_NOTICE = "테스트는 공부 확인용이에요. 성적에 들어가지 않아요.";

/** 백엔드가 안내 문구를 비워 보낼 때 */
const OUTCOME_FALLBACK: Record<QuizReportOutcome["review"], string> = {
  AI_OK: "AI가 확인해 보니 문항에 오류가 없어 보여요. 이 문제는 채점에 들어가요.",
  AI_ERROR: "AI도 문항에 문제가 있다고 봤어요. 채점에서 빼고 선생님께 알렸어요.",
  TO_TEACHER: "신고를 선생님께 보냈어요. 이 문제는 채점에서 빠져요.",
};

const REASONS: Array<{ id: QuizReportReason; label: string }> = [
  { id: "WRONG_ANSWER", label: "정답이 이상해요" },
  { id: "UNCLEAR", label: "문제가 이해 안 돼요" },
  { id: "UNRELATED", label: "공부한 내용과 관계없어요" },
];

/** 체크박스(접근성 유지)를 프로토타입의 칩·체크 항목 모양으로 그린다. pill: 활동 칩, box: 체크리스트 */
export function ChoiceChip({
  checked,
  onChange,
  children,
  variant = "pill",
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
  variant?: "pill" | "box";
}) {
  return (
    <label className={`choice-chip ${variant} ${checked ? "checked" : ""}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="choice-mark" aria-hidden>
        {checked && <Icon name="check" size={variant === "pill" ? 15 : 14} />}
      </span>
      {children}
    </label>
  );
}

/** 마치기 화면: AI가 찾은 주제 → 하나 골라 고정 난이도 테스트 → 결과. 끝나거나 건너뛰면 onDone */
export function TopicStep({ sessionId, onDone }: { sessionId: string; onDone: () => void }) {
  // 외부 LLM을 부르는 요청이라 실패해도 자동 재시도하지 않음 (비용·호출 제한)
  const topics = useQuery({ queryKey: ["session-topics", sessionId], queryFn: () => api.extractTopics(sessionId), retry: false });
  const shareOk = useHasConsent("LEARNING_RECORD");
  const entries = useQuery({ queryKey: ["entries", sessionId], queryFn: () => api.listEntries(sessionId) });
  const [picked, setPicked] = useState<string | null>(null);
  const [quizTopic, setQuizTopic] = useState<SessionTopic | null>(null);

  if (quizTopic) return <TopicQuiz sessionId={sessionId} topicId={quizTopic.topicId} onDone={onDone} onBack={() => setQuizTopic(null)} />;
  // AI 오류가 나도 돌아보기(핵심 기능)로는 넘어갈 수 있어야 함
  if (topics.error) return <SkippableError error={topics.error} onRetry={() => topics.refetch()} onSkip={onDone} />;
  if (!topics.data) return <Spinner label="AI가 오늘 기록에서 주제를 찾는 중" />;

  if (topics.data.length === 0) {
    return (
      <section className="card quiz-card">
        <h2 className="quiz-card-title">오늘 공부한 주제</h2>
        <p className="quiz-note">
          {shareOk
            ? "이번 기록에서 주제를 찾지 못했어요. 다음엔 알게 된 개념이나 궁금한 점을 한 줄씩 남겨 보세요. (교사 공개 기록만 살펴봐요)"
            : "기록 공유에 동의하지 않아 모든 기록이 '나만 보기'라서 AI가 주제를 찾을 수 없어요. 동의 설정에서 바꿀 수 있어요."}
        </p>
        <Button onClick={onDone}>돌아보기로 넘어가기</Button>
      </section>
    );
  }

  const text = (id: string) => (id === "goal" ? "(오늘 할 것)" : (entries.data?.find((e) => e.id === id)?.content ?? ""));
  const chosen = topics.data.find((t) => t.topicId === picked);

  return (
    <div>
      <p className="quiz-intro">AI가 내 기록에서 찾았어요. 다 공부한 주제를 고르면 확인 테스트(5문항)를 볼 수 있어요. {QUIZ_NOTICE}</p>
      <div className="topic-list" role="radiogroup" aria-label="주제">
        {topics.data.map((t) => {
          const evidence = t.evidenceIds
            .map(text)
            .filter(Boolean)
            .slice(0, 2)
            .map((x) => `"${x.slice(0, 30)}"`)
            .join(", ");
          return (
            <button
              key={t.topicId}
              type="button"
              role="radio"
              aria-checked={picked === t.topicId}
              onClick={() => setPicked(t.topicId)}
              className={`card topic-card ${picked === t.topicId ? "selected" : ""}`}
            >
              <div>
                <Badge tone="sky">AI 자동 분류 · 참고용</Badge>
                <h3>{t.name}</h3>
                {t.subject && <p>{t.subject}</p>}
                <blockquote>근거: {evidence}</blockquote>
              </div>
              <span className="radio" aria-hidden>
                {picked === t.topicId && <span />}
              </span>
            </button>
          );
        })}
      </div>
      <div className="sticky-actions">
        <Button variant="ghost" onClick={onDone}>
          이번엔 건너뛸게요
        </Button>
        <Button disabled={!chosen} onClick={() => chosen && setQuizTopic(chosen)}>
          이 주제 다 공부했어요, 테스트 보기
        </Button>
      </div>
    </div>
  );
}

/** 오류 화면 + 돌아보기로 넘어가는 탈출구 */
function SkippableError({ error, onRetry, onSkip, onBack }: { error: unknown; onRetry: () => void; onSkip: () => void; onBack?: () => void }) {
  return (
    <div className="quiz-error">
      <ErrorState error={error} onRetry={onRetry} />
      <div className="sticky-actions">
        {onBack && (
          <Button variant="secondary" onClick={onBack}>
            주제 다시 고르기
          </Button>
        )}
        <Button variant="ghost" onClick={onSkip}>
          테스트 없이 돌아보기로 넘어가기
        </Button>
      </div>
    </div>
  );
}

function TopicQuiz({ sessionId, topicId, onDone, onBack }: { sessionId: string; topicId: string; onDone: () => void; onBack: () => void }) {
  const qc = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, number | null>>({});
  const [reported, setReported] = useState<Record<string, QuizReportOutcome>>({});
  const [reporting, setReporting] = useState<string | null>(null);
  const quiz = useQuery({ queryKey: ["quiz", sessionId, topicId], queryFn: () => api.getQuiz(sessionId, topicId), retry: false });
  const report = useMutation({
    mutationFn: (v: { questionId: string; reason: QuizReportReason }) => api.reportQuestion(sessionId, v.questionId, v.reason),
    onSuccess: (out, v) => {
      setReported((r) => ({ ...r, [v.questionId]: out }));
      // AI가 문제 없다고 본 문항은 채점에 들어가므로 고른 답을 그대로 둔다
      if (out.review !== "AI_OK") setAnswers((a) => ({ ...a, [v.questionId]: null }));
      setReporting(null);
    },
  });
  // 제출 직후 응시 캐시를 갱신하면 상위 화면이 결과를 보여 주기 전에 넘어가므로, 결과를 본 뒤(finish)에 갱신
  const submit = useMutation({ mutationFn: () => api.submitQuiz(sessionId, answers) });
  const finish = () => {
    qc.invalidateQueries({ queryKey: ["quiz-attempt", sessionId] });
    onDone();
  };
  const alreadyTaken = submit.error instanceof ApiError && submit.error.code === "QUIZ_ALREADY_TAKEN";
  const taken = useQuery({ queryKey: ["quiz-attempt-taken", sessionId], queryFn: () => api.getQuizAttempt(sessionId), enabled: alreadyTaken });

  if (submit.data) return <QuizResult attempt={submit.data} onNext={finish} />;
  if (alreadyTaken) {
    if (taken.data) return <QuizResult attempt={taken.data} onNext={finish} />;
    return (
      <section className="card quiz-card">
        <p className="quiz-note">이번 학습의 테스트는 이미 제출했어요.</p>
        <Button onClick={finish}>돌아보기로 넘어가기</Button>
      </section>
    );
  }
  if (quiz.error) return <SkippableError error={quiz.error} onRetry={() => quiz.refetch()} onSkip={finish} onBack={onBack} />;
  if (!quiz.data) return <Spinner label="AI가 문제를 준비하는 중이에요 (처음 나오는 주제는 시간이 조금 걸려요)" />;
  const { topic, questions } = quiz.data;
  // 신고 상태는 서버(출제 스냅샷)가 기억 → 새로고침해도 유지
  // 신고 결과: 이번 화면에서 받은 것 우선, 없으면 출제 스냅샷(새로고침 후)
  const outcomeOf = (q: StudentQuizQuestion) => reported[q.id] ?? q.reportOutcome;
  const isReportedQ = (q: StudentQuizQuestion) => (!!reported[q.id] && reported[q.id].review !== "AI_OK") || !!q.reported;
  const active = questions.filter((q) => !isReportedQ(q));
  const answered = active.filter((q) => answers[q.id] !== undefined && answers[q.id] !== null).length;

  return (
    <div>
      <div className="page-heading quiz-heading">
        <div>
          <Badge tone="sky">성적에 들어가지 않아요</Badge>
          <h2>{topic.name} 확인 테스트</h2>
          <p>모두에게 같은 난이도로 나와요. 이상한 문제는 신고하면 AI가 먼저 확인하고, 오류가 있거나 다른 친구도 신고한 문제는 채점에서 빠져요. {QUIZ_NOTICE}</p>
        </div>
        <strong className="question-count">
          {answered}/{active.length} 선택
        </strong>
      </div>
      <ol className="quiz-questions">
        {questions.map((q, i) => {
          const isReported = isReportedQ(q);
          return (
            <li key={q.id} className={`question card ${isReported ? "reported" : ""}`}>
              <div className="question-top">
                <Badge tone="stone">
                  {i + 1}번 · {q.type === "OX" ? "OX" : "객관식"}
                </Badge>
                {isReported ? (
                  <Badge tone="amber">신고함 · 채점 제외</Badge>
                ) : outcomeOf(q)?.review === "AI_OK" ? (
                  <Badge tone="sky">AI 확인 · 채점 포함</Badge>
                ) : (
                  reporting !== q.id && (
                    <button type="button" onClick={() => setReporting(q.id)}>
                      <Icon name="alert" size={16} /> 이 문제 이상해요
                    </button>
                  )
                )}
              </div>
              <h3>{q.prompt}</h3>
              {outcomeOf(q) && (
                <p className="report-outcome" role="status">
                  {outcomeOf(q)!.message || OUTCOME_FALLBACK[outcomeOf(q)!.review]}
                </p>
              )}
              <div className={`answers ${q.type === "OX" ? "ox" : ""}`} role="radiogroup" aria-label={`${i + 1}번 문제`}>
                {q.choices.map((c, ci) => (
                  <button
                    key={ci}
                    type="button"
                    role="radio"
                    aria-checked={answers[q.id] === ci}
                    disabled={isReported}
                    onClick={() => setAnswers((a) => ({ ...a, [q.id]: ci }))}
                    className={answers[q.id] === ci ? "selected" : ""}
                  >
                    <span aria-hidden>{ci + 1}</span>
                    {c}
                  </button>
                ))}
              </div>
              {!isReported && reporting === q.id && (
                <div className="report-reasons">
                  {REASONS.map((r) => (
                    <Button key={r.id} variant="secondary" disabled={report.isPending} onClick={() => report.mutate({ questionId: q.id, reason: r.id })}>
                      {r.label}
                    </Button>
                  ))}
                  <Button variant="ghost" disabled={report.isPending} onClick={() => setReporting(null)}>
                    취소
                  </Button>
                  {report.isPending && report.variables?.questionId === q.id && (
                    <p className="report-outcome" role="status">
                      AI가 문항을 확인하는 중이에요. 몇 초 걸릴 수 있어요.
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {(submit.error || report.error) && <ErrorState error={submit.error ?? report.error} />}
      <div className="sticky-actions">
        <Button onClick={() => submit.mutate()} disabled={submit.isPending || submit.isSuccess || report.isPending}>
          {answered < active.length ? `제출하기 (${active.length - answered}개 안 고름)` : "제출하기"}
        </Button>
      </div>
    </div>
  );
}

/** collapsed: 기록 화면에서는 점수만 보이고 문항은 눌러서 펼친다 */
export function QuizResult({ attempt, onNext, collapsed = false }: { attempt: QuizAttempt; onNext?: () => void; collapsed?: boolean }) {
  const score = attempt.total === 0 ? "채점할 문항이 없어요" : `${attempt.correct} / ${attempt.total}`;
  const title = `확인 테스트 결과: ${score}`;
  const list = (
    <div className="result-list">
      {attempt.items.map((it, i) => {
        const out = it.reported || it.excluded;
        const mark = out ? "제외" : it.correct ? "맞음" : "틀림";
        return (
          <article key={it.questionId} className={`card result-row ${out ? "excluded" : it.correct ? "" : "wrong"}`}>
            <span className="result-mark" role="img" aria-label={mark}>
              {out ? <Icon name="alert" size={20} /> : it.correct ? <Icon name="check" /> : "×"}
            </span>
            <div>
              <small>
                {i + 1}번 문항
              </small>
              <h3>{it.prompt}</h3>
              {it.reported && <Badge tone="stone">신고함 · 채점 제외</Badge>}
              {!it.reported && it.excluded && <Badge tone="stone">문항 오류 · 채점 제외</Badge>}
              <strong>
                내 답: {it.chosen === null ? "고르지 않음" : it.choices[it.chosen]} · 정답: {it.choices[it.answerIndex]}
              </strong>
              <p>해설: {it.explanation}</p>
            </div>
          </article>
        );
      })}
    </div>
  );
  if (collapsed) {
    return (
      <section className="card quiz-card quiz-collapsed">
        <details>
          <summary>
            {title} <span>· 문항 보기</span>
          </summary>
          <p className="quiz-note">틀린 문제는 해설을 보고 다음 학습 때 다시 살펴봐요. {QUIZ_NOTICE}</p>
          {list}
        </details>
      </section>
    );
  }
  return (
    <div>
      <div className="page-heading result-heading">
        <div>
          <p className="eyebrow">확인 테스트 결과</p>
          <h2>{score}</h2>
          <p>틀린 문제는 해설을 보고 다음 학습 때 다시 살펴봐요. {QUIZ_NOTICE}</p>
        </div>
        <Badge tone="sky">성적에 반영되지 않아요</Badge>
      </div>
      {list}
      {onNext && (
        <div className="sticky-actions">
          <Button onClick={onNext}>돌아보기로 넘어가기</Button>
        </div>
      )}
    </div>
  );
}
