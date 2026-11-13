import { useCallback, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { api } from "../../api";
import { Button, Card, CheckChip, ErrorState, PageTitle } from "../../components/ui";
import { GOAL_ACTIVITIES, SUBJECTS } from "../../lib/checklists";
import type { AuthEvent, SessionGoal } from "../../types/domain";
import { AuthWait } from "./AuthWait";

export function StartPage() {
  const [subject, setSubject] = useState<string>("");
  const [activities, setActivities] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [step, setStep] = useState<"goal" | "auth">("goal");
  const qc = useQueryClient();
  const nav = useNavigate();

  const start = useMutation({
    mutationFn: (ev: AuthEvent) => {
      const goal: SessionGoal = { subject, activities, note: note.trim() || undefined };
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

  const toggle = (id: string, on: boolean) =>
    setActivities((a) => (on ? [...a, id] : a.filter((x) => x !== id)));

  if (step === "auth") {
    return (
      <div className="mx-auto max-w-xl">
        <PageTitle sub={`${subject} · 목표 ${activities.length}개`}>학습 시작 인증</PageTitle>
        {start.error ? (
          <ErrorState error={start.error} onRetry={() => start.reset()} />
        ) : (
          <AuthWait purpose="start" onAuth={onAuth} />
        )}
        <Button variant="ghost" className="mt-3" onClick={() => setStep("goal")}>
          목표 다시 고르기
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageTitle sub="고르기만 하면 돼요. 메모는 쓰고 싶을 때만.">오늘의 학습 목표</PageTitle>
      <Card>
        <h2 className="text-sm font-semibold">과목</h2>
        <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="과목">
          {SUBJECTS.map((s) => (
            <button
              key={s}
              role="radio"
              aria-checked={subject === s}
              onClick={() => setSubject(s)}
              className={`rounded-lg border px-4 py-2 text-sm ${subject === s ? "border-brand-500 bg-brand-50 font-semibold text-brand-700" : "border-stone-300"}`}
            >
              {s}
            </button>
          ))}
        </div>

        <h2 className="mt-5 text-sm font-semibold">무엇을 할까요? (여러 개 가능)</h2>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {GOAL_ACTIVITIES.map((a) => (
            <CheckChip key={a.id} checked={activities.includes(a.id)} onChange={(v) => toggle(a.id, v)}>
              {a.label}
            </CheckChip>
          ))}
        </div>

        <label className="mt-5 block text-sm font-semibold" htmlFor="note">
          메모 <span className="font-normal text-stone-400">(선택)</span>
        </label>
        <input
          id="note"
          value={note}
          maxLength={100}
          onChange={(e) => setNote(e.target.value)}
          placeholder="예: 이차함수 꼭짓점 구하는 법"
          className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
        />
      </Card>
      <Button className="mt-4 w-full" disabled={!subject || activities.length === 0} onClick={() => setStep("auth")}>
        다음: 단말기에서 인증하기
      </Button>
    </div>
  );
}
