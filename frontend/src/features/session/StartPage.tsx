import { useCallback, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { api, FEATURES } from "../../api";
import { useHasConsent } from "../../auth/session";
import { Button, ErrorState, PageTitle } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { GOAL_ACTIVITIES } from "../../lib/checklists";
import type { AuthEvent, SessionGoal } from "../../types/domain";
import { AuthWait } from "./AuthWait";
import { ChoiceChip, StudySteps } from "./TopicQuiz";

/** 과목·단원을 고르지 않는다(고교학점제). "오늘 할 것"만 쓰면 되고, 주제는 마칠 때 AI가 기록에서 찾는다. */
export function StartPage() {
  const [plan, setPlan] = useState("");
  const [activities, setActivities] = useState<string[]>([]);
  const [step, setStep] = useState<"goal" | "auth">("goal");
  const qc = useQueryClient();
  const nav = useNavigate();
  // 주제 찾기·확인 테스트는 AI 동의가 있어야 열린다 (EndPage와 같은 조건)
  const aiOk = useHasConsent("AI");
  const withQuiz = FEATURES.quiz && aiOk;

  const start = useMutation({
    mutationFn: (ev: AuthEvent) => {
      const goal: SessionGoal = { subject: plan.trim(), activities };
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
          <AuthWait purpose="start" onAuth={onAuth} note={`오늘 할 것: ${plan.trim()}`} />
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
          <p>짧게 적어도 괜찮아요. 과목은 고르지 않아도 돼요. 마칠 때 기록을 보고 AI가 함께 정리해 줘요.</p>
        </div>
      </div>
      <section className="card form-card">
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
