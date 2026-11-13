import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";
import { api, FEATURES } from "../../api";
import { Badge, Button, ErrorState, PageTitle, Spinner } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { REFLECTION_ITEMS, UNDERSTANDING_LABELS } from "../../lib/checklists";
import { formatDuration, formatTime } from "../../lib/time";
import type { AuthEvent, GroundedItem, LearningSession } from "../../types/domain";
import { AuthWait } from "./AuthWait";
import { useHasConsent } from "../../auth/session";
import { ChoiceChip, TopicStep } from "./TopicQuiz";

export function EndPage() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const session = useQuery({ queryKey: ["session", id], queryFn: () => api.getSession(id) });

  const end = useMutation({
    mutationFn: (ev: AuthEvent) => api.endSession(id, ev.id),
    onSuccess: (s) => {
      qc.setQueryData(["session", id], s);
      qc.invalidateQueries({ queryKey: ["active-session"] });
    },
  });

  const onAuth = useCallback(
    (ev: AuthEvent) => {
      if (!end.isPending && !end.isSuccess) end.mutate(ev);
    },
    [end],
  );

  if (session.isLoading) return <Spinner />;
  if (session.error) return <ErrorState error={session.error} />;
  const s = session.data!;

  if (s.status === "ACTIVE") {
    return (
      <div>
        <PageTitle sub="인증하면 학습 시간이 기록돼요">학습 마치기</PageTitle>
        {end.error ? <ErrorState error={end.error} onRetry={() => end.reset()} /> : <AuthWait purpose="end" onAuth={onAuth} />}
      </div>
    );
  }
  return <AfterEnd session={s} />;
}

/** 종료 후: AI가 찾은 주제 → 확인 테스트(이미 봤으면 생략) → 돌아보기 */
function AfterEnd({ session }: { session: LearningSession }) {
  const [quizDone, setQuizDone] = useState(false);
  // 주제 추출·문항 생성은 기록을 AI로 보내므로 AI 동의가 있어야 함
  const aiOk = useHasConsent("AI");
  const topicsOn = FEATURES.quiz && aiOk;
  const attempt = useQuery({
    queryKey: ["quiz-attempt", session.id],
    queryFn: () => api.getQuizAttempt(session.id),
    enabled: topicsOn,
  });
  if (topicsOn && !quizDone) {
    if (attempt.error) return <ErrorState error={attempt.error} onRetry={() => attempt.refetch()} />;
    if (attempt.isLoading) return <Spinner />;
    if (!attempt.data) {
      return (
        <div>
          <PageTitle sub={`${formatTime(session.startedAt)} ~ ${formatTime(session.endedAt!)}`}>
            오늘 {formatDuration(session.durationMinutes ?? 0)} 공부했어요
          </PageTitle>
          <TopicStep sessionId={session.id} onDone={() => setQuizDone(true)} />
        </div>
      );
    }
  }
  return <Wrapup session={session} />;
}

function Wrapup({ session }: { session: LearningSession }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  // 요약도 기록을 AI로 보내므로 AI 동의가 없으면 부르지 않는다 (서버도 403 CONSENT_REQUIRED)
  const aiOk = useHasConsent("AI");
  const summary = useQuery({ queryKey: ["summary", session.id], queryFn: () => api.summarizeSession(session.id), enabled: aiOk });
  const [checks, setChecks] = useState<string[]>([]);
  const [understanding, setUnderstanding] = useState<1 | 2 | 3 | null>(null);
  const [questions, setQuestions] = useState<string[]>([]);
  const [newQ, setNewQ] = useState("");
  const [note, setNote] = useState("");

  const save = useMutation({
    mutationFn: () =>
      api.saveReflection({ sessionId: session.id, checks, understanding: understanding!, remainingQuestions: questions, note: note.trim() || undefined }),
    onSuccess: async () => {
      await qc.invalidateQueries();
      nav(`/student/records?session=${session.id}`);
    },
  });

  const toggleQ = (q: string, on: boolean) => setQuestions((list) => (on ? [...list, q] : list.filter((x) => x !== q)));

  return (
    <div>
      <div className="page-heading">
        <div>
          <p className="eyebrow">학습 돌아보기</p>
          <h1>오늘 {formatDuration(session.durationMinutes ?? 0)} 공부했어요</h1>
          <p>{formatTime(session.startedAt)} ~ {formatTime(session.endedAt!)}</p>
        </div>
      </div>

      <section className="card reflection">
        <div className="reflection-head">
          <h2>오늘 한 일</h2>
          {aiOk && <Badge tone="sky">AI 요약 · 근거 포함</Badge>}
        </div>
        {aiOk ? (
          <p className="reflection-note">내가 남긴 기록에서만 뽑았어요. 기록에 없는 내용은 만들지 않아요.</p>
        ) : (
          <p className="reflection-note">AI 이용에 동의하지 않아 기록을 AI로 정리하지 않았어요. 아래 체크리스트로 직접 돌아봐요.</p>
        )}
        {summary.isLoading && <Spinner label="정리하는 중" />}
        {summary.error && <ErrorState error={summary.error} onRetry={() => summary.refetch()} />}
        {summary.data && (
          <>
            <GroundedList items={summary.data.activities} empty="교사 공개 기록이 없어 정리할 활동이 없어요" />
            {summary.data.remainingQuestions.length > 0 && (
              <>
                <h2>남긴 질문 — 아직 궁금한 것을 골라 주세요</h2>
                <div className="checklist">
                  {summary.data.remainingQuestions.map((q) => (
                    <ChoiceChip key={q.text} variant="box" checked={questions.includes(q.text)} onChange={(v) => toggleQ(q.text, v)}>
                      {q.text}
                    </ChoiceChip>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        <h2>오늘 나는</h2>
        <p className="reflection-hint">해당하는 것만 체크하세요</p>
        <div className="checklist">
          {REFLECTION_ITEMS.map((r) => (
            <ChoiceChip
              key={r.id}
              variant="box"
              checked={checks.includes(r.id)}
              onChange={(v) => setChecks((c) => (v ? [...c, r.id] : c.filter((x) => x !== r.id)))}
            >
              {r.label}
            </ChoiceChip>
          ))}
        </div>

        <h2>오늘 내용, 얼마나 이해했나요?</h2>
        <div className="understanding" role="radiogroup" aria-label="이해도">
          {([1, 2, 3] as const).map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={understanding === n}
              onClick={() => setUnderstanding(n)}
              className={understanding === n ? "selected" : ""}
            >
              {UNDERSTANDING_LABELS[n]}
            </button>
          ))}
        </div>

        <details className="reflection-more">
          <summary>더 남기고 싶은 말이 있나요? (선택)</summary>
          <div className="reflection-add">
            <input
              value={newQ}
              maxLength={200}
              onChange={(e) => setNewQ(e.target.value)}
              placeholder="새로 생긴 궁금증"
              aria-label="새로 생긴 궁금증"
              className="reflection-input"
            />
            <Button
              variant="secondary"
              disabled={!newQ.trim() || questions.length >= 5}
              onClick={() => {
                toggleQ(newQ.trim(), true);
                setNewQ("");
              }}
            >
              추가
            </Button>
          </div>
          {questions.length > 0 && (
            <ul className="reflection-qs">
              {questions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          )}
          <textarea
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            aria-label="참고 메모"
            placeholder="참고 메모 (선생님께 하고 싶은 말 등)"
          />
        </details>

        {save.error && <ErrorState error={save.error} />}
        <Button className="full" disabled={understanding === null || save.isPending} onClick={() => save.mutate()}>
          저장하기
        </Button>
      </section>
    </div>
  );
}

export function GroundedList({ items, empty }: { items: GroundedItem[]; empty: string }) {
  if (items.length === 0) return <p className="grounded-empty">{empty}</p>;
  return (
    <ul className="grounded-list">
      {items.map((i, idx) => (
        <li key={`${idx}-${i.text}`}>
          <Icon name="check" size={15} />
          <span>{i.text}</span>
        </li>
      ))}
    </ul>
  );
}
