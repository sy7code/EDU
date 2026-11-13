import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import { useMe } from "../../auth/session";
import { Badge, Button, Card, ErrorState, Spinner } from "../../components/ui";
import type { CriterionScore, LearningSession, Rubric } from "../../types/domain";

/** 교차채점: AI는 근거와 함께 '제안'만, 교사가 확정. 둘이 다르면 표시한다. */
export function AssessmentPanel({ session, onEvidence }: { session: LearningSession; onEvidence: (ids: string[]) => void }) {
  const me = useMe();
  const qc = useQueryClient();
  const rubric = useQuery({ queryKey: ["rubric", me.data?.classId], queryFn: () => api.getRubric(me.data!.classId), enabled: !!me.data });
  const assessment = useQuery({ queryKey: ["assessment", session.id], queryFn: () => api.getAssessment(session.id) });
  const [draft, setDraft] = useState<Record<string, number | null>>({});

  useEffect(() => {
    const base = assessment.data?.teacher ?? assessment.data?.ai ?? [];
    setDraft(Object.fromEntries(base.map((s) => [s.criterionId, s.level])));
  }, [assessment.data]);

  const askAi = useMutation({
    mutationFn: () => api.requestAiAssessment(session.id),
    onSuccess: (a) => qc.setQueryData(["assessment", session.id], a),
  });
  const finalize = useMutation({
    mutationFn: (scores: CriterionScore[]) => api.finalizeAssessment(session.id, scores),
    onSuccess: (a) => {
      qc.setQueryData(["assessment", session.id], a);
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  if (session.status !== "ENDED") {
    return (
      <Card>
        <h3 className="font-semibold">관찰 평가</h3>
        <p className="mt-1 text-sm text-stone-500">학습이 끝나면 평가할 수 있어요.</p>
      </Card>
    );
  }
  if (rubric.isLoading || assessment.isLoading) return <Spinner />;
  if (rubric.error) return <ErrorState error={rubric.error} />;
  const r = rubric.data!;
  const ai = assessment.data?.ai ?? null;
  const finalized = assessment.data?.finalizedAt;

  function submit() {
    const scores: CriterionScore[] = r.criteria.map((c) => {
      const aiScore = ai?.find((s) => s.criterionId === c.id);
      const level = draft[c.id] ?? null;
      const same = aiScore && aiScore.level === level;
      return {
        criterionId: c.id,
        level,
        reason: same ? aiScore.reason : "교사 관찰",
        evidenceIds: same ? aiScore.evidenceIds : [],
      };
    });
    finalize.mutate(scores);
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{r.title}</h3>
        {finalized ? <Badge tone="brand">확정됨</Badge> : <Badge tone="sky">확정 전</Badge>}
        <Button variant="secondary" className="ml-auto px-3 py-1.5 text-xs" onClick={() => askAi.mutate()} disabled={askAi.isPending}>
          {ai ? "AI 채점안 다시 받기" : "AI 채점안 받기"}
        </Button>
      </div>
      <p className="mt-1 text-xs text-stone-500">
        AI는 학생이 공개한 기록만 근거로 제안해요. 근거가 없으면 비워 둬요. 최종 판단은 선생님이 해요. 학생에게는 확정본만 보여요.
      </p>
      {askAi.error && <div className="mt-2"><ErrorState error={askAi.error} /></div>}

      <div className="mt-4 space-y-3">
        {r.criteria.map((c) => (
          <CriterionRow
            key={c.id}
            criterion={c}
            ai={ai?.find((s) => s.criterionId === c.id) ?? null}
            value={draft[c.id] ?? null}
            onChange={(v) => setDraft((d) => ({ ...d, [c.id]: v }))}
            onEvidence={onEvidence}
          />
        ))}
      </div>

      {finalize.error && <div className="mt-2"><ErrorState error={finalize.error} /></div>}
      <Button className="mt-4 w-full" onClick={submit} disabled={finalize.isPending}>
        {finalized ? "수정해서 다시 확정" : "선생님 판단으로 확정"}
      </Button>
    </Card>
  );
}

function CriterionRow({
  criterion,
  ai,
  value,
  onChange,
  onEvidence,
}: {
  criterion: Rubric["criteria"][number];
  ai: CriterionScore | null;
  value: number | null;
  onChange: (v: number | null) => void;
  onEvidence: (ids: string[]) => void;
}) {
  const differs = ai && ai.level !== null && value !== null && ai.level !== value;
  return (
    <div className={`rounded-lg border p-3 ${differs ? "border-amber-300 bg-amber-50/50" : "border-stone-200"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium">{criterion.label}</p>
        {differs && <Badge tone="amber">AI와 판단 다름</Badge>}
      </div>
      {ai && (
        <div className="mt-1.5 text-xs text-stone-600">
          AI 제안: <strong>{ai.level === null ? "근거 부족 — 판단 보류" : criterion.levels[ai.level]}</strong> · {ai.reason}
          {ai.evidenceIds.length > 0 && (
            <button className="ml-2 text-brand-700 underline" onClick={() => onEvidence(ai.evidenceIds)}>
              근거 {ai.evidenceIds.length}개 보기
            </button>
          )}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label={`${criterion.label} 교사 판단`}>
        {criterion.levels.map((l, i) => (
          <button
            key={l}
            role="radio"
            aria-checked={value === i}
            onClick={() => onChange(i)}
            className={`rounded-md border px-3 py-1.5 text-sm ${value === i ? "border-brand-500 bg-brand-50 font-semibold text-brand-700" : "border-stone-300"}`}
          >
            {l}
          </button>
        ))}
        <button
          role="radio"
          aria-checked={value === null}
          onClick={() => onChange(null)}
          className={`rounded-md border px-3 py-1.5 text-sm ${value === null ? "border-stone-500 bg-stone-100" : "border-stone-300 text-stone-500"}`}
        >
          판단 보류
        </button>
      </div>
    </div>
  );
}

/** 학생용 읽기 전용 보기 */
export function AssessmentView({ sessionId, scores }: { sessionId: string; scores: CriterionScore[] }) {
  const me = useMe();
  const rubric = useQuery({ queryKey: ["rubric", me.data?.classId, sessionId], queryFn: () => api.getRubric(me.data!.classId), enabled: !!me.data });
  if (!rubric.data) return null;
  return (
    <ul className="mt-3 space-y-1.5 text-sm">
      {rubric.data.criteria.map((c) => {
        const s = scores.find((x) => x.criterionId === c.id);
        return (
          <li key={c.id} className="flex justify-between gap-3">
            <span>{c.label}</span>
            <strong>{s?.level == null ? "-" : c.levels[s.level]}</strong>
          </li>
        );
      })}
    </ul>
  );
}
