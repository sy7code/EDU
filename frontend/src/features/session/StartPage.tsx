import { useCallback, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { api } from "../../api";
import { Button, Card, CheckChip, ErrorState, PageTitle } from "../../components/ui";
import { GOAL_ACTIVITIES } from "../../lib/checklists";
import type { AuthEvent, SessionGoal } from "../../types/domain";
import { AuthWait } from "./AuthWait";

/** 과목·단원을 고르지 않는다(고교학점제). "오늘 할 것"만 쓰면 되고, 주제는 마칠 때 AI가 기록에서 찾는다. */
export function StartPage() {
  const [plan, setPlan] = useState("");
  const [activities, setActivities] = useState<string[]>([]);
  const [step, setStep] = useState<"goal" | "auth">("goal");
  const qc = useQueryClient();
  const nav = useNavigate();

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
      <div className="mx-auto max-w-xl">
        <PageTitle sub={plan.trim()}>학습 시작 인증</PageTitle>
        {start.error ? <ErrorState error={start.error} onRetry={() => start.reset()} /> : <AuthWait purpose="start" onAuth={onAuth} />}
        <Button variant="ghost" className="mt-3" onClick={() => setStep("goal")}>
          다시 쓰기
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageTitle sub="과목을 고를 필요 없어요. 무엇을 공부했는지는 마칠 때 기록을 보고 AI가 정리해 줘요.">오늘 할 것</PageTitle>
      <Card>
        <label htmlFor="plan" className="text-sm font-semibold">
          오늘 무엇을 공부할까요?
        </label>
        <input
          id="plan"
          value={plan}
          maxLength={200}
          onChange={(e) => setPlan(e.target.value)}
          placeholder="예: 이차함수 꼭짓점 구하는 법 복습"
          className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
        />

        <h2 className="mt-5 text-sm font-semibold">
          어떻게 할까요? <span className="font-normal text-stone-400">(선택)</span>
        </h2>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {GOAL_ACTIVITIES.map((a) => (
            <CheckChip key={a.id} checked={activities.includes(a.id)} onChange={(v) => toggle(a.id, v)}>
              {a.label}
            </CheckChip>
          ))}
        </div>
      </Card>
      <Button className="mt-4 w-full" disabled={!plan.trim()} onClick={() => setStep("auth")}>
        다음: 단말기에서 인증하기
      </Button>
    </div>
  );
}
