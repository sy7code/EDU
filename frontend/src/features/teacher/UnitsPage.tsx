import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import { useMe } from "../../auth/session";
import { Badge, Button, Card, EmptyState, ErrorState, PageTitle, Spinner } from "../../components/ui";
import type { QuizQuestion, Unit } from "../../types/domain";

/** 단원 문제 관리: AI 초안(근거 표시) → 교사가 고치고 승인. 학생에겐 승인된 문제만 나간다. */
export function UnitsPage() {
  const me = useMe();
  const units = useQuery({ queryKey: ["units", me.data?.classId], queryFn: () => api.listUnits(me.data!.classId), enabled: !!me.data });
  const [selected, setSelected] = useState<string | null>(null);

  if (units.isLoading) return <Spinner />;
  if (units.error) return <ErrorState error={units.error} onRetry={() => units.refetch()} />;
  const list = units.data ?? [];
  const unit = list.find((u) => u.id === (selected ?? list[0]?.id));

  return (
    <div>
      <PageTitle sub="AI가 성취기준을 근거로 초안을 만들고, 선생님이 고치고 승인한 문제만 학생에게 나가요.">단원 문제 관리</PageTitle>
      <div className="grid gap-5 md:grid-cols-[240px_1fr]">
        <ul className="space-y-1.5">
          {list.map((u) => (
            <li key={u.id}>
              <button
                onClick={() => setSelected(u.id)}
                className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${u.id === unit?.id ? "border-brand-500 bg-brand-50" : "border-stone-200 bg-white hover:bg-stone-50"}`}
              >
                <p className="text-xs text-stone-500">{u.subject} · {u.order}단원</p>
                <p className="font-medium">{u.title}</p>
              </button>
            </li>
          ))}
        </ul>
        {unit ? <UnitQuestions key={unit.id} unit={unit} /> : <EmptyState title="단원이 없어요" />}
      </div>
    </div>
  );
}

function UnitQuestions({ unit }: { unit: Unit }) {
  const qc = useQueryClient();
  const key = ["unit-questions", unit.id];
  const questions = useQuery({ queryKey: key, queryFn: () => api.listUnitQuestions(unit.id) });
  const [adding, setAdding] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const draft = useMutation({ mutationFn: () => api.draftQuestionsWithAi(unit.id), onSuccess: refresh });

  const list = questions.data ?? [];
  const approved = list.filter((q) => q.status === "APPROVED").length;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{unit.title}</h2>
          <Badge tone="brand">승인 {approved}개</Badge>
          <Badge>초안 {list.length - approved}개</Badge>
        </div>
        <p className="mt-2 text-sm">
          <span className="text-stone-500">성취기준 · </span>
          {unit.standard || <span className="text-amber-700">아직 입력되지 않았어요. 근거가 없으면 AI 초안을 만들지 않아요.</span>}
        </p>
        <p className="mt-1 text-xs text-stone-500">학생은 승인된 문제 중 최대 5개를 풀어요.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => draft.mutate()} disabled={draft.isPending || !unit.standard}>
            {draft.isPending ? "만드는 중…" : "AI 초안 3개 만들기"}
          </Button>
          <Button variant="secondary" onClick={() => setAdding(true)} disabled={adding}>
            직접 문제 추가
          </Button>
        </div>
        {draft.error && <div className="mt-2"><ErrorState error={draft.error} /></div>}
      </Card>

      {adding && (
        <QuestionEditor
          initial={{ id: "", unitId: unit.id, type: "MCQ", prompt: "", choices: ["", "", "", ""], answerIndex: 0, explanation: "", source: "TEACHER", status: "DRAFT", evidence: unit.standard }}
          onDone={() => {
            setAdding(false);
            refresh();
          }}
        />
      )}

      {questions.isLoading && <Spinner />}
      {questions.error && <ErrorState error={questions.error} onRetry={() => questions.refetch()} />}
      {questions.data && list.length === 0 && <EmptyState title="문제가 없어요">AI 초안을 만들거나 직접 추가해 보세요.</EmptyState>}
      <ul className="space-y-3">
        {list.map((q) => (
          <QuestionCard key={q.id} q={q} onChanged={refresh} />
        ))}
      </ul>
    </div>
  );
}

function QuestionCard({ q, onChanged }: { q: QuizQuestion; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const status = useMutation({ mutationFn: (s: "DRAFT" | "APPROVED") => api.setQuestionStatus(q.id, s), onSuccess: onChanged });
  const del = useMutation({ mutationFn: () => api.deleteQuestion(q.id), onSuccess: onChanged });

  if (editing) return <li><QuestionEditor initial={q} onDone={() => { setEditing(false); onChanged(); }} /></li>;

  return (
    <li className={`rounded-xl border bg-white p-4 ${q.status === "APPROVED" ? "border-brand-100" : "border-dashed border-stone-300"}`}>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <Badge tone={q.status === "APPROVED" ? "brand" : "amber"}>{q.status === "APPROVED" ? "승인됨 · 학생에게 출제" : "초안 · 출제 안 됨"}</Badge>
        <Badge tone={q.source === "AI" ? "sky" : "stone"}>{q.source === "AI" ? "AI 초안" : "선생님 작성"}</Badge>
        <Badge>{q.type === "OX" ? "O/X" : "객관식"}</Badge>
      </div>
      <p className="mt-2 font-medium">{q.prompt}</p>
      <ol className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
        {q.choices.map((c, i) => (
          <li key={i} className={i === q.answerIndex ? "font-semibold text-brand-700" : "text-stone-600"}>
            {i === q.answerIndex ? "✓ " : `${i + 1}. `}
            {c}
          </li>
        ))}
      </ol>
      <p className="mt-2 text-sm text-stone-500">해설: {q.explanation || "-"}</p>
      {q.source === "AI" && <p className="mt-1 text-xs text-sky-800">근거(성취기준): {q.evidence}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {q.status === "APPROVED" ? (
          <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => status.mutate("DRAFT")} disabled={status.isPending}>
            출제 중지
          </Button>
        ) : (
          <Button className="px-3 py-1.5 text-xs" onClick={() => status.mutate("APPROVED")} disabled={status.isPending}>
            검토했어요, 승인
          </Button>
        )}
        <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => setEditing(true)}>
          수정
        </Button>
        {confirmDelete ? (
          <>
            <Button variant="danger" className="px-3 py-1.5 text-xs" onClick={() => del.mutate()} disabled={del.isPending}>
              정말 삭제
            </Button>
            <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => setConfirmDelete(false)}>
              취소
            </Button>
          </>
        ) : (
          <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => setConfirmDelete(true)}>
            삭제
          </Button>
        )}
      </div>
      {(status.error || del.error) && <div className="mt-2"><ErrorState error={status.error ?? del.error} /></div>}
    </li>
  );
}

function QuestionEditor({ initial, onDone }: { initial: QuizQuestion; onDone: () => void }) {
  const [q, setQ] = useState<QuizQuestion>(initial);
  const save = useMutation({ mutationFn: () => api.saveQuestion(q), onSuccess: onDone });
  const setType = (type: "MCQ" | "OX") =>
    setQ((x) => ({ ...x, type, choices: type === "OX" ? ["O", "X"] : x.type === "OX" ? ["", "", "", ""] : x.choices, answerIndex: 0 }));

  return (
    <Card className="border-brand-500">
      <div className="flex gap-2" role="radiogroup" aria-label="문제 유형">
        {(["MCQ", "OX"] as const).map((t) => (
          <button
            key={t}
            role="radio"
            aria-checked={q.type === t}
            onClick={() => setType(t)}
            className={`rounded-md border px-3 py-1.5 text-sm ${q.type === t ? "border-brand-500 bg-brand-50 font-semibold text-brand-700" : "border-stone-300"}`}
          >
            {t === "MCQ" ? "객관식" : "O/X"}
          </button>
        ))}
      </div>
      <label className="mt-3 block text-sm font-semibold" htmlFor={`p-${q.id}`}>문제</label>
      <textarea id={`p-${q.id}`} rows={2} maxLength={300} value={q.prompt} onChange={(e) => setQ({ ...q, prompt: e.target.value })} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
      <p className="mt-3 text-sm font-semibold">선택지 (정답을 고르세요)</p>
      <div className="mt-1 space-y-1.5">
        {q.choices.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <input type="radio" name={`ans-${q.id}`} aria-label={`${i + 1}번을 정답으로`} checked={q.answerIndex === i} onChange={() => setQ({ ...q, answerIndex: i })} className="accent-brand-600" />
            <input
              value={c}
              maxLength={100}
              disabled={q.type === "OX"}
              aria-label={`선택지 ${i + 1}`}
              onChange={(e) => setQ({ ...q, choices: q.choices.map((x, j) => (j === i ? e.target.value : x)) })}
              className="flex-1 rounded-lg border border-stone-300 px-3 py-1.5 text-sm disabled:bg-stone-100"
            />
          </div>
        ))}
      </div>
      <label className="mt-3 block text-sm font-semibold" htmlFor={`e-${q.id}`}>해설</label>
      <textarea id={`e-${q.id}`} rows={2} maxLength={500} value={q.explanation} onChange={(e) => setQ({ ...q, explanation: e.target.value })} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
      {save.error && <div className="mt-2"><ErrorState error={save.error} /></div>}
      <div className="mt-3 flex gap-2">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>저장</Button>
        <Button variant="ghost" onClick={onDone}>취소</Button>
      </div>
    </Card>
  );
}
