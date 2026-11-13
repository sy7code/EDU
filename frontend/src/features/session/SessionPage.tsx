import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useParams } from "react-router";
import { api } from "../../api";
import { useHasConsent } from "../../auth/session";
import { Badge, Button, ButtonLink, Card, EmptyState, ErrorState, Spinner } from "../../components/ui";
import { goalLabel } from "../../lib/checklists";
import { elapsedLabel, formatTime } from "../../lib/time";
import type { EntryKind, LearningEntry, Visibility } from "../../types/domain";

const KIND_LABEL: Record<EntryKind, string> = {
  MEMO: "메모",
  QUESTION: "궁금한 점",
  QUIZ: "짧은 테스트",
  PAPER: "종이에 기록",
};

function useTick(ms = 1000) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

export function SessionPage() {
  const { id = "" } = useParams();
  const session = useQuery({ queryKey: ["session", id], queryFn: () => api.getSession(id) });
  const entries = useQuery({ queryKey: ["entries", id], queryFn: () => api.listEntries(id) });
  const aiOk = useHasConsent("AI");
  const shareOk = useHasConsent("LEARNING_RECORD");
  const [teacherView, setTeacherView] = useState(false);
  useTick();

  if (session.isLoading) return <Spinner />;
  if (session.error) return <ErrorState error={session.error} onRetry={() => session.refetch()} />;
  const s = session.data!;
  if (s.status === "ENDED") return <Navigate to={`/student/records?session=${s.id}`} replace />;

  const list = (entries.data ?? []).filter((e) => !teacherView || e.visibility === "TEACHER");

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <Card className="flex flex-wrap items-center gap-3">
          <div>
            <p className="text-xs text-stone-500">{formatTime(s.startedAt)} 시작 · 오늘의 목표</p>
            <p className="font-semibold">
              {goalLabel(s.goal)}
            </p>
            {s.goal.note && <p className="text-sm text-stone-600">{s.goal.note}</p>}
          </div>
          <p className="ml-auto font-mono text-2xl tabular-nums text-brand-700" aria-label="경과 시간">
            {elapsedLabel(s.startedAt)}
          </p>
          <ButtonLink to={`/student/session/${s.id}/end`} variant="secondary">
            학습 끝내기
          </ButtonLink>
        </Card>

        <EntryComposer sessionId={s.id} shareOk={shareOk} />

        <div className="flex items-center justify-between">
          <h2 className="font-semibold">오늘의 기록</h2>
          <label className="flex items-center gap-2 text-sm text-stone-600">
            <input type="checkbox" className="accent-brand-600" checked={teacherView} onChange={(e) => setTeacherView(e.target.checked)} />
            선생님이 보는 화면으로 보기
          </label>
        </div>
        {entries.isLoading && <Spinner />}
        {entries.error && <ErrorState error={entries.error} onRetry={() => entries.refetch()} />}
        {entries.data && list.length === 0 && (
          <EmptyState title={teacherView ? "선생님께 공개된 기록이 없어요" : "아직 기록이 없어요"}>
            공부하다가 알게 된 것, 궁금한 것을 짧게 남겨 보세요.
          </EmptyState>
        )}
        <ul className="space-y-2">
          {list.map((e) => (
            <EntryItem key={e.id} entry={e} />
          ))}
        </ul>
      </div>

      <aside>{aiOk ? <AiPanel sessionId={s.id} /> : <AiDisabled />}</aside>
    </div>
  );
}

function EntryItem({ entry }: { entry: LearningEntry }) {
  return (
    <li className="rounded-lg border border-stone-200 bg-white p-3">
      <div className="flex items-center gap-2 text-xs text-stone-500">
        <Badge tone={entry.kind === "QUESTION" ? "amber" : entry.kind === "PAPER" ? "sky" : "stone"}>{KIND_LABEL[entry.kind]}</Badge>
        <span>{formatTime(entry.createdAt)}</span>
        <span className="ml-auto">{entry.visibility === "PRIVATE" ? "🔒 나만 보기" : "교사 공개"}</span>
      </div>
      {entry.content && <p className="mt-1.5 whitespace-pre-wrap text-sm">{entry.content}</p>}
      {entry.kind === "PAPER" && !entry.content && <p className="mt-1.5 text-sm text-stone-500">공책·학습지에 직접 정리했어요</p>}
    </li>
  );
}

function EntryComposer({ sessionId, shareOk }: { sessionId: string; shareOk: boolean }) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<EntryKind>("MEMO");
  const [content, setContent] = useState("");
  const [visibility, setVisibility] = useState<Visibility>(shareOk ? "TEACHER" : "PRIVATE");

  // 보낸 값을 고정해 두고 입력창은 바로 비운다. 실패하면 되돌린다 (저장 중에 쓴 다음 내용이 지워지지 않게).
  const add = useMutation({
    mutationFn: (v: { kind: EntryKind; content: string }) =>
      api.addEntry({ sessionId, kind: v.kind, content: v.content, visibility: shareOk ? visibility : "PRIVATE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["entries", sessionId] }),
    onError: (_e, v) => setContent((cur) => cur || v.content),
  });

  const canSubmit = kind === "PAPER" || content.trim().length > 0;
  const submit = () => {
    add.mutate({ kind, content });
    setContent("");
  };

  return (
    <Card>
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="기록 종류">
        {(Object.keys(KIND_LABEL) as EntryKind[]).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={kind === k}
            onClick={() => setKind(k)}
            className={`rounded-full px-3 py-1.5 text-sm ${kind === k ? "bg-ink text-white" : "bg-stone-100 text-stone-600"}`}
          >
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        maxLength={2000}
        rows={3}
        placeholder={
          kind === "PAPER"
            ? "공책에 정리했다면 그대로 저장해도 돼요. (한 줄 메모는 선택)"
            : kind === "QUESTION"
              ? "궁금한 점을 적어 두면 나중에 돌아볼 때 도움이 돼요"
              : "알게 된 것, 해 본 것을 짧게 적어요"
        }
        className="mt-3 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
      />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {shareOk ? (
          <div className="flex gap-1 text-sm" role="radiogroup" aria-label="공개 범위">
            {(["TEACHER", "PRIVATE"] as Visibility[]).map((v) => (
              <button
                key={v}
                role="radio"
                aria-checked={visibility === v}
                onClick={() => setVisibility(v)}
                className={`rounded-md border px-2.5 py-1 ${visibility === v ? "border-brand-500 bg-brand-50 text-brand-700" : "border-stone-300 text-stone-500"}`}
              >
                {v === "TEACHER" ? "교사 공개" : "🔒 나만 보기"}
              </button>
            ))}
          </div>
        ) : (
          <span className="text-xs text-stone-500">기록 공유에 동의하지 않아 모든 기록은 나만 봐요</span>
        )}
        <Button className="ml-auto" disabled={!canSubmit} onClick={submit}>
          {kind === "PAPER" && !content.trim() ? "종이에 기록했어요" : "기록하기"}
        </Button>
      </div>
      {add.error && <div className="mt-2"><ErrorState error={add.error} /></div>}
    </Card>
  );
}

function AiDisabled() {
  return (
    <Card className="text-sm text-stone-600">
      <p className="font-semibold">AI 도우미가 꺼져 있어요</p>
      <p className="mt-1">AI 사용에 동의하지 않았어요. 필요하면 동의 설정에서 바꿀 수 있어요.</p>
      <Link to="/student/consent" className="mt-3 inline-block text-brand-700 underline">
        동의 설정
      </Link>
    </Card>
  );
}

function AiPanel({ sessionId }: { sessionId: string }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const msgs = useQuery({ queryKey: ["ai", sessionId], queryFn: () => api.listAiMessages(sessionId) });
  const ask = useMutation({
    mutationFn: (content: string) => api.askAi(sessionId, content),
    onMutate: () => setText(""),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai", sessionId] }),
    onError: (_e, sent) => setText((cur) => cur || sent),
  });

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [msgs.data, ask.isPending]);

  return (
    <Card className="flex h-[70vh] flex-col p-0">
      <div className="border-b border-stone-200 px-4 py-3">
        <p className="font-semibold">AI 학습 도우미</p>
        <p className="text-xs text-stone-500">답을 대신 써 주지 않고, 스스로 생각하도록 질문해요</p>
      </div>
      <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-3" aria-live="polite">
        {msgs.isLoading && <Spinner />}
        {msgs.data?.length === 0 && <p className="text-sm text-stone-400">막힌 부분을 물어보세요. 예: "꼭짓점 공식이 왜 이렇게 나와?"</p>}
        {msgs.data?.map((m) => (
          <div
            key={m.id}
            className={`max-w-[90%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${
              m.role === "ai" ? "bg-stone-100" : "ml-auto bg-brand-600 text-white"
            }`}
          >
            {m.content}
          </div>
        ))}
        {ask.isPending && <p className="text-sm text-stone-400">생각하는 중…</p>}
        {ask.error && <ErrorState error={ask.error} onRetry={() => ask.variables && ask.mutate(ask.variables)} />}
      </div>
      <form
        className="border-t border-stone-200 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) ask.mutate(text);
        }}
      >
        <p className="mb-1.5 text-xs text-amber-700">이름·전화번호 같은 개인정보는 쓰지 마세요</p>
        <div className="flex gap-2">
          <input
            value={text}
            maxLength={1000}
            onChange={(e) => setText(e.target.value)}
            placeholder="AI에게 물어보기"
            aria-label="AI에게 보낼 메시지"
            className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm"
          />
          <Button type="submit" disabled={!text.trim() || ask.isPending}>
            보내기
          </Button>
        </div>
      </form>
    </Card>
  );
}
