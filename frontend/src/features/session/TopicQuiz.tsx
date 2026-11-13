import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../api";
import { Badge, Button, Card, ErrorState, Spinner } from "../../components/ui";
import type { QuizAttempt, QuizReportReason, SessionTopic } from "../../types/domain";

export const QUIZ_NOTICE = "테스트는 공부 확인용이에요. 성적에 들어가지 않아요.";

const REASONS: Array<{ id: QuizReportReason; label: string }> = [
  { id: "WRONG_ANSWER", label: "정답이 이상해요" },
  { id: "UNCLEAR", label: "문제가 이해 안 돼요" },
  { id: "UNRELATED", label: "공부한 내용과 관계없어요" },
];

/** 마치기 화면: AI가 찾은 주제 → 하나 골라 고정 난이도 테스트 → 결과. 끝나거나 건너뛰면 onDone */
export function TopicStep({ sessionId, onDone }: { sessionId: string; onDone: () => void }) {
  const topics = useQuery({ queryKey: ["session-topics", sessionId], queryFn: () => api.extractTopics(sessionId) });
  const entries = useQuery({ queryKey: ["entries", sessionId], queryFn: () => api.listEntries(sessionId) });
  const [picked, setPicked] = useState<string | null>(null);
  const [quizTopic, setQuizTopic] = useState<SessionTopic | null>(null);

  if (quizTopic) return <TopicQuiz sessionId={sessionId} topicId={quizTopic.topicId} onDone={onDone} onBack={() => setQuizTopic(null)} />;
  // AI 오류가 나도 돌아보기(핵심 기능)로는 넘어갈 수 있어야 함
  if (topics.error) return <SkippableError error={topics.error} onRetry={() => topics.refetch()} onSkip={onDone} />;
  if (!topics.data) return <Spinner label="AI가 오늘 기록에서 주제를 찾는 중" />;

  if (topics.data.length === 0) {
    return (
      <Card>
        <h2 className="font-semibold">오늘 공부한 주제</h2>
        <p className="mt-2 text-sm text-stone-500">
          이번 기록에서 주제를 찾지 못했어요. 다음엔 알게 된 개념이나 궁금한 점을 한 줄씩 남겨 보세요. (교사 공개 기록만 살펴봐요)
        </p>
        <Button className="mt-4" onClick={onDone}>
          돌아보기로 넘어가기
        </Button>
      </Card>
    );
  }

  const text = (id: string) => (id === "goal" ? "(오늘 할 것)" : (entries.data?.find((e) => e.id === id)?.content ?? ""));
  const chosen = topics.data.find((t) => t.topicId === picked);

  return (
    <Card>
      <h2 className="font-semibold">오늘 공부한 주제</h2>
      <p className="text-xs text-stone-500">AI가 내 기록에서 찾았어요. 다 공부한 주제를 고르면 확인 테스트(5문항)를 볼 수 있어요. {QUIZ_NOTICE}</p>
      <div className="mt-3 space-y-2" role="radiogroup" aria-label="주제">
        {topics.data.map((t) => (
          <button
            key={t.topicId}
            role="radio"
            aria-checked={picked === t.topicId}
            onClick={() => setPicked(t.topicId)}
            className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm ${picked === t.topicId ? "border-brand-500 bg-brand-50" : "border-stone-300 hover:bg-stone-50"}`}
          >
            <span className="font-semibold">{t.name}</span> {t.subject && <span className="text-xs text-stone-400">{t.subject}</span>}
            <span className="mt-1 block text-xs text-stone-500">
              근거: {t.evidenceIds.map(text).filter(Boolean).slice(0, 2).map((x) => `"${x.slice(0, 30)}"`).join(", ")}
            </span>
          </button>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button disabled={!chosen} onClick={() => chosen && setQuizTopic(chosen)}>
          이 주제 다 공부했어요, 테스트 보기
        </Button>
        <Button variant="ghost" onClick={onDone}>
          이번엔 건너뛸게요
        </Button>
      </div>
    </Card>
  );
}

/** 오류 화면 + 돌아보기로 넘어가는 탈출구 */
function SkippableError({ error, onRetry, onSkip, onBack }: { error: unknown; onRetry: () => void; onSkip: () => void; onBack?: () => void }) {
  return (
    <div className="space-y-2">
      <ErrorState error={error} onRetry={onRetry} />
      <div className="flex flex-wrap gap-2">
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
  const [reported, setReported] = useState<Record<string, QuizReportReason>>({});
  const [reporting, setReporting] = useState<string | null>(null);
  const quiz = useQuery({ queryKey: ["quiz", sessionId, topicId], queryFn: () => api.getQuiz(sessionId, topicId) });
  const report = useMutation({
    mutationFn: (v: { questionId: string; reason: QuizReportReason }) => api.reportQuestion(sessionId, v.questionId, v.reason),
    onSuccess: (_d, v) => {
      setReported((r) => ({ ...r, [v.questionId]: v.reason }));
      setAnswers((a) => ({ ...a, [v.questionId]: null }));
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
      <Card>
        <p className="text-sm">이번 학습의 테스트는 이미 제출했어요.</p>
        <Button className="mt-4" onClick={finish}>
          돌아보기로 넘어가기
        </Button>
      </Card>
    );
  }
  if (quiz.error) return <SkippableError error={quiz.error} onRetry={() => quiz.refetch()} onSkip={finish} onBack={onBack} />;
  if (!quiz.data) return <Spinner label="AI가 문제를 준비하는 중이에요 (처음 나오는 주제는 시간이 조금 걸려요)" />;
  const { topic, questions } = quiz.data;
  const active = questions.filter((q) => !reported[q.id]);
  const answered = active.filter((q) => answers[q.id] !== undefined && answers[q.id] !== null).length;

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">{topic.name} 확인 테스트</h2>
        <Badge>
          {answered}/{active.length} 선택
        </Badge>
      </div>
      <p className="text-xs text-stone-500">모두에게 같은 난이도로 나와요. 이상한 문제는 신고하면 채점에서 빠져요. {QUIZ_NOTICE}</p>
      <ol className="mt-4 space-y-5">
        {questions.map((q, i) => {
          const isReported = !!reported[q.id];
          return (
            <li key={q.id} className={isReported ? "opacity-50" : ""}>
              <p className="text-sm font-medium">
                {i + 1}. {q.prompt} {isReported && <Badge tone="amber">신고함 · 채점 제외</Badge>}
              </p>
              <div className={`mt-2 grid gap-1.5 ${q.type === "OX" ? "grid-cols-2 sm:max-w-xs" : "sm:grid-cols-2"}`} role="radiogroup" aria-label={`${i + 1}번 문제`}>
                {q.choices.map((c, ci) => (
                  <button
                    key={ci}
                    role="radio"
                    aria-checked={answers[q.id] === ci}
                    disabled={isReported}
                    onClick={() => setAnswers((a) => ({ ...a, [q.id]: ci }))}
                    className={`rounded-lg border px-3 py-2 text-left text-sm disabled:cursor-not-allowed ${
                      answers[q.id] === ci ? "border-brand-500 bg-brand-50 font-semibold text-brand-700" : "border-stone-300 hover:bg-stone-50"
                    } ${q.type === "OX" ? "text-center text-lg" : ""}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              {!isReported &&
                (reporting === q.id ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {REASONS.map((r) => (
                      <Button key={r.id} variant="secondary" className="px-2.5 py-1 text-xs" disabled={report.isPending} onClick={() => report.mutate({ questionId: q.id, reason: r.id })}>
                        {r.label}
                      </Button>
                    ))}
                    <Button variant="ghost" className="px-2.5 py-1 text-xs" onClick={() => setReporting(null)}>
                      취소
                    </Button>
                  </div>
                ) : (
                  <button className="mt-1.5 text-xs text-stone-400 underline-offset-2 hover:underline" onClick={() => setReporting(q.id)}>
                    이 문제 이상해요
                  </button>
                ))}
            </li>
          );
        })}
      </ol>
      {(submit.error || report.error) && <div className="mt-3"><ErrorState error={submit.error ?? report.error} /></div>}
      <Button className="mt-5 w-full" onClick={() => submit.mutate()} disabled={submit.isPending || submit.isSuccess}>
        {answered < active.length ? `제출하기 (${active.length - answered}개 안 고름)` : "제출하기"}
      </Button>
    </Card>
  );
}

export function QuizResult({ attempt, onNext }: { attempt: QuizAttempt; onNext?: () => void }) {
  return (
    <Card>
      <h2 className="font-semibold">
        확인 테스트 결과: {attempt.total === 0 ? "채점할 문항이 없어요" : `${attempt.correct} / ${attempt.total}`}
      </h2>
      <p className="text-xs text-stone-500">틀린 문제는 해설을 보고 다음 학습 때 다시 살펴봐요. {QUIZ_NOTICE}</p>
      <ol className="mt-4 space-y-3">
        {attempt.items.map((it, i) => (
          <li
            key={it.questionId}
            className={`rounded-lg border p-3 text-sm ${it.reported || it.excluded ? "border-stone-200 bg-stone-50 text-stone-500" : it.correct ? "border-brand-100 bg-brand-50/50" : "border-amber-200 bg-amber-50/60"}`}
          >
            <p className="font-medium">
              {it.reported || it.excluded ? "🚩" : it.correct ? "⭕" : "❌"} {i + 1}. {it.prompt} {it.reported && <Badge>신고함 · 채점 제외</Badge>}
              {!it.reported && it.excluded && <Badge>문항 오류 · 채점 제외</Badge>}
            </p>
            <p className="mt-1 text-stone-600">
              내 답: {it.chosen === null ? "고르지 않음" : it.choices[it.chosen]} · 정답: <strong>{it.choices[it.answerIndex]}</strong>
            </p>
            <p className="mt-1 text-stone-500">해설: {it.explanation}</p>
          </li>
        ))}
      </ol>
      {onNext && (
        <Button className="mt-4 w-full" onClick={onNext}>
          돌아보기로 넘어가기
        </Button>
      )}
    </Card>
  );
}
