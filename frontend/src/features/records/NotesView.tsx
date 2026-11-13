import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api";
import { Badge, Card, EmptyState, ErrorState, Spinner } from "../../components/ui";
import { SearchBox } from "../../components/SearchBox";
import { goalLabel, reflectionLabel, UNDERSTANDING_LABELS } from "../../lib/checklists";
import { buildNotebook } from "../../lib/notebook";
import { formatDateTime, formatTime } from "../../lib/time";

const KIND: Record<string, string> = { MEMO: "메모", QUESTION: "궁금한 점", QUIZ: "짧은 테스트", PAPER: "종이에 기록" };

/** 학생 '내 정리' 탭: 내가 쓴 기록·돌아보기·남은 질문을 한곳에서 (비공개 메모 포함, 본인만 봄) */
export function NotesView({ onOpenSession }: { onOpenSession: (sessionId: string) => void }) {
  const [query, setQuery] = useState("");
  const notes = useQuery({ queryKey: ["my-notes"], queryFn: () => api.listMyNotes() });
  if (notes.isLoading) return <Spinner label="내 정리를 모으는 중" />;
  if (notes.error) return <ErrorState error={notes.error} onRetry={() => notes.refetch()} />;
  if (!notes.data) return null;
  const nb = buildNotebook(notes.data.sessions, notes.data.entries, notes.data.reflections, query);
  const empty = notes.data.entries.length === 0 && notes.data.reflections.length === 0;
  if (empty) return <EmptyState title="아직 정리한 내용이 없어요">학습 중에 메모를 남기거나 학습을 마치고 돌아보기를 쓰면 여기에 모여요.</EmptyState>;

  return (
    <section className="notes-view">
      <div className="notes-toolbar">
        <SearchBox value={query} onChange={setQuery} placeholder="메모·돌아보기에서 찾기" label="내 정리에서 찾기" />
      </div>

      {nb.openQuestions.length > 0 && (
        <Card>
          <h3 className="records-card-title">아직 남은 질문 {nb.openQuestions.length}개</h3>
          <p className="records-card-sub">돌아보기에 적은 궁금한 것. 다음 학습 때 해결해 봐요</p>
          <ul className="notes-questions">
            {nb.openQuestions.map((q, i) => (
              <li key={`${q.sessionId}-${i}`}>
                <button type="button" onClick={() => onOpenSession(q.sessionId)}>
                  <strong>{q.text}</strong>
                  <small>{formatDateTime(q.startedAt)}</small>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {nb.sessions.length === 0 ? (
        <p className="table-empty">검색 결과가 없어요</p>
      ) : (
        nb.sessions.map(({ session, entries, reflection }) => (
          <Card key={session.id}>
            <div className="notes-head">
              <div>
                <small>{formatDateTime(session.startedAt)}</small>
                <h3 className="records-card-title">{goalLabel(session.goal)}</h3>
              </div>
              <button type="button" className="notes-open" onClick={() => onOpenSession(session.id)}>
                학습 기록 보기
              </button>
            </div>
            {entries.length > 0 && (
              <ul className="notes-entries">
                {entries.map((e) => (
                  <li key={e.id}>
                    <span className="notes-meta">
                      <Badge tone={e.kind === "QUESTION" ? "amber" : "stone"}>{KIND[e.kind] ?? e.kind}</Badge>
                      {e.visibility === "PRIVATE" && <Badge>나만 보기</Badge>}
                      <small>{formatTime(e.createdAt)}</small>
                    </span>
                    <p>{e.content || (e.kind === "PAPER" ? "공책·학습지에 직접 정리" : "")}</p>
                  </li>
                ))}
              </ul>
            )}
            {reflection && (
              <div className="notes-reflection">
                <strong>돌아보기</strong>
                {reflection.understanding && <p>이해도: {UNDERSTANDING_LABELS[reflection.understanding]}</p>}
                {reflection.checks.length > 0 && <p>{reflection.checks.map(reflectionLabel).join(" · ")}</p>}
                {reflection.note && <p>메모: {reflection.note}</p>}
                {reflection.legacyText && <p>{reflection.legacyText}</p>}
                {reflection.remainingQuestions.length > 0 && <p>남은 질문: {reflection.remainingQuestions.join(", ")}</p>}
              </div>
            )}
          </Card>
        ))
      )}
    </section>
  );
}
