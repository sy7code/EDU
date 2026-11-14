import { useCallback, useRef, useState, type KeyboardEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { api, FEATURES } from "../../api";
import { useHasConsent } from "../../auth/session";
import { Button, ErrorState, PageTitle } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { GOAL_ACTIVITIES, SUBJECTS } from "../../lib/checklists";
import { buildGoal, suggestSubject } from "../../lib/subjectTag";
import type { AuthEvent, SessionGoal } from "../../types/domain";
import { AuthWait } from "./AuthWait";
import { ChoiceChip, StudySteps } from "./TopicQuiz";

/** "오늘 할 것"은 꼭 쓴다. 과목 태그는 선택(안 고르면 기타 → 담임만 봄). 단원·주제는 마칠 때 AI가 기록에서 찾는다. */
export function StartPage() {
  const [plan, setPlan] = useState("");
  // 학생이 직접 고르거나 끈 과목. 손대기 전(undefined)에는 글에서 찾은 과목을 제안으로 보여 준다
  const [picked, setPicked] = useState<string | null | undefined>(undefined);
  const suggested = picked === undefined ? suggestSubject(plan) : null;
  const subject = picked === undefined ? suggested : picked;
  const [activities, setActivities] = useState<string[]>([]);
  const [step, setStep] = useState<"goal" | "auth">("goal");
  const qc = useQueryClient();
  const nav = useNavigate();
  // 주제 찾기·확인 테스트는 AI 동의가 있어야 열린다 (EndPage와 같은 조건)
  const aiOk = useHasConsent("AI");
  const withQuiz = FEATURES.quiz && aiOk;

  const start = useMutation({
    mutationFn: (ev: AuthEvent) => {
      const goal: SessionGoal = buildGoal(plan, subject, activities);
      return api.startSession({ goal, authEventId: ev.id });
    },
    onSuccess: async (s) => {
      await qc.invalidateQueries();
      nav(`/student/session/${s.id}`, { replace: true });
    },
  });

  const onAuth = useCallback(
    (ev: AuthEvent) => {
      if (!start.isPending && !start.isSuccess) start.mutate(ev);
    },
    [start],
  );

  const toggle = (id: string, on: boolean) => setActivities((a) => (on ? [...a, id] : a.filter((x) => x !== id)));

  if (step === "auth") {
    return (
      <div>
        <StudySteps current="authStart" withQuiz={withQuiz} />
        {start.error ? (
          <>
            <PageTitle sub={plan.trim()}>학습 시작 인증</PageTitle>
            <ErrorState error={start.error} onRetry={() => start.reset()} />
          </>
        ) : (
          <AuthWait purpose="start" onAuth={onAuth} note={`오늘 할 것: ${subject && subject !== "기타" ? `[${subject}] ` : ""}${plan.trim()}`} />
        )}
        <div className="study-auth-back">
          <Button variant="ghost" onClick={() => setStep("goal")}>
            다시 쓰기
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <StudySteps current="goal" withQuiz={withQuiz} />
      <div className="page-heading">
        <div>
          <p className="eyebrow">학습 시작</p>
          <h1>오늘은 무엇을 공부하나요?</h1>
          <p>짧게 적어도 괜찮아요. 과목 태그는 골라도 되고 안 골라도 돼요. 마칠 때 기록을 보고 AI가 함께 정리해 줘요.</p>
        </div>
      </div>
      <section className="card form-card">
        <SubjectChips value={subject} suggested={suggested} onChange={setPicked} />

        <label htmlFor="plan">오늘 할 것</label>
        <input
          id="plan"
          value={plan}
          maxLength={200}
          onChange={(e) => setPlan(e.target.value)}
          placeholder="예: 이차함수 꼭짓점 구하는 법 복습"
          className="large-input"
        />

        <h2 className="form-label">
          어떤 활동을 할 건가요? <small>(선택)</small>
        </h2>
        <div className="chips">
          {GOAL_ACTIVITIES.map((a) => (
            <ChoiceChip key={a.id} checked={activities.includes(a.id)} onChange={(v) => toggle(a.id, v)}>
              {a.label}
            </ChoiceChip>
          ))}
        </div>
        <Button className="full" disabled={!plan.trim()} onClick={() => setStep("auth")}>
          다음: 단말기에서 인증하기 <Icon name="chevron" />
        </Button>
      </section>
    </div>
  );
}

/** 과목 태그: 하나만 고르고 다시 누르면 끈다. radiogroup + 화살표로 옮겨 고르기, Space·Enter로 켜고 끄기 */
function SubjectChips({ value, suggested, onChange }: { value: string | null; suggested: string | null; onChange: (v: string | null) => void }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const focusIdx = Math.max(0, SUBJECTS.findIndex((s) => s === value));
  const onArrow = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + SUBJECTS.length) % SUBJECTS.length;
    onChange(SUBJECTS[next]);
    refs.current[next]?.focus();
  };
  return (
    <>
      <h2 className="form-label" id="subject-label">
        과목 <small>(선택)</small>
      </h2>
      <div className="chips subject-chips" role="radiogroup" aria-labelledby="subject-label" aria-describedby="subject-hint">
        {SUBJECTS.map((s, i) => (
          <button
            key={s}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={value === s}
            tabIndex={i === focusIdx ? 0 : -1}
            className={value === s ? (suggested === s ? "selected suggested" : "selected") : ""}
            onClick={() => onChange(value === s ? null : s)}
            onKeyDown={(e) => onArrow(e, i)}
          >
            {s}
          </button>
        ))}
      </div>
      <p className="subject-hint" id="subject-hint">
        {suggested ? `쓴 글을 보고 '${suggested}'을 골라 두었어요. 다르면 바꾸거나 다시 눌러 끄세요. ` : ""}
        {FEATURES.subjectTeacher ? "과목을 고르면 그 과목 선생님도 볼 수 있어요(교과 공개 동의 시). 안 고르면 담임 선생님만 봐요." : ""}
      </p>
    </>
  );
}
