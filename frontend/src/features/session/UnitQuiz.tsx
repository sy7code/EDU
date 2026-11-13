import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import { Badge, Button, Card, CheckChip, ErrorState, Spinner } from "../../components/ui";
import type { QuizAttempt } from "../../types/domain";

export const QUIZ_NOTICE = "테스트는 공부 확인용이에요. 성적에 들어가지 않아요.";

/** 단원 테스트: 확인 → 풀기 → 결과·해설. 끝나거나 건너뛰면 onDone */
export function UnitQuiz({ sessionId, onDone }: { sessionId: string; onDone: () => void }) {
  const qc = useQueryClient();
  const [stage, setStage] = useState<"confirm" | "quiz">("confirm");
  const [ready, setReady] = useState(false);
  const [answers, setAnswers] = useState<Record<string, number | null>>({});
  const quiz = useQuery({ queryKey: ["quiz", sessionId], queryFn: () => api.getQuiz(sessionId), enabled: stage === "quiz" });
  // 제출 직후 응시 캐시를 갱신하면 상위 화면이 결과를 보여 주기 전에 다음 단계로 넘어가므로,
  // 결과를 다 본 뒤(onNext)에 갱신한다.
  const submit = useMutation({ mutationFn: () => api.submitQuiz(sessionId, answers) });
  const finish = () => {
    qc.invalidateQueries({ queryKey: ["quiz-attempt", sessionId] });
    onDone();
  };

  if (submit.data) return <QuizResult attempt={submit.data} onNext={finish} />;

  if (stage === "confirm") {
    return (
      <Card>
        <h2 className="font-semibold">단원 테스트</h2>
        <p className="mt-1 text-sm text-stone-500">{QUIZ_NOTICE} 다 풀면 바로 정답과 해설을 볼 수 있어요.</p>
        <div className="mt-4">
          <CheckChip checked={ready} onChange={setReady}>
            이 단원을 다 공부했어요
          </CheckChip>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button disabled={!ready} onClick={() => setStage("quiz")}>
            테스트 시작
          </Button>
          <Button variant="ghost" onClick={onDone}>
            나중에 할게요
          </Button>
        </div>
      </Card>
    );
  }

  if (quiz.isLoading) return <Spinner label="문제를 불러오는 중" />;
  if (quiz.error) return <ErrorState error={quiz.error} onRetry={() => quiz.refetch()} />;
  const { unit, questions } = quiz.data!;

  if (questions.length === 0) {
    return (
      <Card>
        <h2 className="font-semibold">{unit.title}</h2>
        <p className="mt-2 text-sm text-stone-500">아직 선생님이 준비한 문제가 없어요. 다음에 다시 볼 수 있어요.</p>
        <Button className="mt-4" onClick={onDone}>
          돌아보기로 넘어가기
        </Button>
      </Card>
    );
  }

  const answered = questions.filter((q) => answers[q.id] !== undefined && answers[q.id] !== null).length;

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">{unit.title} 단원 테스트</h2>
        <Badge>{answered}/{questions.length} 선택</Badge>
      </div>
      <p className="text-xs text-stone-500">{QUIZ_NOTICE}</p>
      <ol className="mt-4 space-y-5">
        {questions.map((q, i) => (
          <li key={q.id}>
            <p className="text-sm font-medium">
              {i + 1}. {q.prompt}
            </p>
            <div className={`mt-2 grid gap-1.5 ${q.type === "OX" ? "grid-cols-2 sm:max-w-xs" : "sm:grid-cols-2"}`} role="radiogroup" aria-label={`${i + 1}번 문제`}>
              {q.choices.map((c, ci) => (
                <button
                  key={ci}
                  role="radio"
                  aria-checked={answers[q.id] === ci}
                  onClick={() => setAnswers((a) => ({ ...a, [q.id]: ci }))}
                  className={`rounded-lg border px-3 py-2 text-left text-sm ${
                    answers[q.id] === ci ? "border-brand-500 bg-brand-50 font-semibold text-brand-700" : "border-stone-300 hover:bg-stone-50"
                  } ${q.type === "OX" ? "text-center text-lg" : ""}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ol>
      {submit.error && <div className="mt-3"><ErrorState error={submit.error} /></div>}
      <Button className="mt-5 w-full" onClick={() => submit.mutate()} disabled={submit.isPending || submit.isSuccess}>
        {answered < questions.length ? `제출하기 (${questions.length - answered}개 안 고름)` : "제출하기"}
      </Button>
    </Card>
  );
}

export function QuizResult({ attempt, onNext }: { attempt: QuizAttempt; onNext?: () => void }) {
  return (
    <Card>
      <h2 className="font-semibold">
        단원 테스트 결과: {attempt.correct} / {attempt.total}
      </h2>
      <p className="text-xs text-stone-500">틀린 문제는 해설을 보고 다음 학습 때 다시 살펴봐요. {QUIZ_NOTICE}</p>
      <ol className="mt-4 space-y-3">
        {attempt.items.map((it, i) => (
          <li key={it.questionId} className={`rounded-lg border p-3 text-sm ${it.correct ? "border-brand-100 bg-brand-50/50" : "border-amber-200 bg-amber-50/60"}`}>
            <p className="font-medium">
              {it.correct ? "⭕" : "❌"} {i + 1}. {it.prompt}
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
