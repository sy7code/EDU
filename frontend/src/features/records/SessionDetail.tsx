import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMe } from "../../auth/session";
import { api, FEATURES } from "../../api";
import { Icon } from "../../components/Icon";
import { Badge, Card, ErrorState, METHOD_LABEL, Spinner } from "../../components/ui";
import { goalLabel, reflectionLabel, UNDERSTANDING_LABELS } from "../../lib/checklists";
import { formatDateTime, formatDuration, formatTime } from "../../lib/time";
import type { LearningSession } from "../../types/domain";
import { QuizResult } from "../session/TopicQuiz";

type Item =
  | { at: string; id: string; type: "entry"; kind: string; content: string; isPrivate: boolean }
  | { at: string; id: string; type: "ai"; role: "student" | "ai"; content: string };

const KIND: Record<string, string> = { MEMO: "메모", QUESTION: "궁금한 점", QUIZ: "짧은 테스트", PAPER: "종이에 기록" };

/** 학생·교사 공용 세션 타임라인. 교사에게는 서버가 PRIVATE 기록을 내려주지 않는다. */
export function SessionDetail({ session, highlight = [] }: { session: LearningSession; highlight?: string[] }) {
  const entries = useQuery({ queryKey: ["entries", session.id], queryFn: () => api.listEntries(session.id) });
  const ai = useQuery({ queryKey: ["ai", session.id], queryFn: () => api.listAiMessages(session.id) });
  const refl = useQuery({ queryKey: ["reflection", session.id], queryFn: () => api.getReflection(session.id) });
  const fb = useQuery({ queryKey: ["feedback", session.id], queryFn: () => api.listFeedback(session.id) });
  const me = useMe();
  const qc = useQueryClient();
  // 학생이 피드백 카드를 실제로 보면(화면에 절반 이상 들어오면) 안 읽은 피드백을 읽음으로.
  // 이번에 처음 본 것은 '새' 표시를 남겨 둔다
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [seen, setSeen] = useState(false);
  // 기록을 불러오는 동안엔 카드가 없으므로, 카드가 생기는 순간을 state로 받는다
  const [fbEl, setFbEl] = useState<HTMLDivElement | null>(null);
  const inFlight = useRef<Set<string>>(new Set()); // 같은 피드백을 두 번 보내지 않게
  useEffect(() => {
    setNewIds(new Set());
    setSeen(false);
  }, [session.id]);
  useEffect(() => {
    const el = fbEl;
    if (!el || seen || me.data?.role !== "student") return;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setSeen(true), { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [fbEl, seen, me.data?.role]);
  useEffect(() => {
    if (!seen || me.data?.role !== "student" || !fb.data) return;
    const unread = fb.data.filter((f) => !f.readAt && !inFlight.current.has(f.id));
    if (unread.length === 0) return;
    unread.forEach((f) => inFlight.current.add(f.id));
    setNewIds((prev) => new Set([...prev, ...unread.map((f) => f.id)]));
    Promise.all(unread.map((f) => api.markFeedbackRead(f.id)))
      .then(() => qc.invalidateQueries({ queryKey: ["feedback", session.id] }))
      .catch(() => unread.forEach((f) => inFlight.current.delete(f.id))); // 실패하면 다음에 다시 시도
  }, [seen, fb.data, me.data?.role, session.id, qc]);
  const quiz = useQuery({
    queryKey: ["quiz-attempt", session.id],
    queryFn: () => api.getQuizAttempt(session.id),
    enabled: FEATURES.quiz && session.status === "ENDED",
  });

  if (entries.isLoading || ai.isLoading) return <Spinner />;
  if (entries.error) return <ErrorState error={entries.error} />;

  const items: Item[] = [
    ...(entries.data ?? []).map((e) => ({
      at: e.createdAt,
      id: e.id,
      type: "entry" as const,
      kind: e.kind,
      content: e.content,
      isPrivate: e.visibility === "PRIVATE",
    })),
    ...(ai.data ?? []).map((m) => ({ at: m.createdAt, id: m.id, type: "ai" as const, role: m.role, content: m.content })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const hl = new Set(highlight);
  const r = refl.data;

  return (
    <div className="session-stack">
      <Card>
        <div className="session-badges">
          <Badge tone="brand">{session.status === "ACTIVE" ? "학습 중" : formatDuration(session.durationMinutes ?? 0)}</Badge>
        </div>
        <p className="session-when">{formatDateTime(session.startedAt)}</p>
        <h2 className={`session-goal ${hl.has("goal") ? "is-highlight" : ""}`}>{goalLabel(session.goal)}</h2>
        {session.goal.note && <p className="session-note">{session.goal.note}</p>}
        <div className="info-line">
          <span>시작 {formatTime(session.startedAt)} · {METHOD_LABEL[session.startAuth]}</span>
          {session.endedAt && session.endAuth && <span>종료 {formatTime(session.endedAt)} · {METHOD_LABEL[session.endAuth]}</span>}
        </div>
      </Card>

      <Card>
        <h3 className="session-h3">학습 과정</h3>
        {items.length === 0 && <p className="session-empty">공개된 기록이 없어요</p>}
        <ol className="mini-timeline">
          {items.map((i) => (
            <li key={i.id} id={`ev-${i.id}`} className={`timeline-item ${hl.has(i.id) ? "is-highlight" : ""} ${i.type === "ai" ? "is-ai" : ""}`}>
              <div className="timeline-meta">
                <span>{formatTime(i.at)}</span>
                {i.type === "entry" ? (
                  <>
                    <Badge tone={i.kind === "QUESTION" ? "amber" : "stone"}>{KIND[i.kind]}</Badge>
                    {i.isPrivate && (
                      <span className="timeline-private">
                        <Icon name="lock" size={13} /> 나만 보기
                      </span>
                    )}
                  </>
                ) : (
                  <Badge tone="sky">{i.role === "ai" ? "AI 도우미" : "AI에게 질문"}</Badge>
                )}
              </div>
              <p className={i.type === "ai" && i.role === "ai" ? "is-muted" : ""}>
                {i.content || (i.type === "entry" && i.kind === "PAPER" ? "공책·학습지에 직접 정리" : "")}
              </p>
            </li>
          ))}
        </ol>
      </Card>

      <Card className={hl.has("reflection") ? "is-highlight-card" : ""}>
        <h3 className="session-h3">돌아보기</h3>
        {refl.isLoading && <Spinner />}
        {!refl.isLoading && !r && <p className="session-empty">아직 돌아보기를 하지 않았어요</p>}
        {r && (
          <div className="reflection-body">
            {r.understanding ? (
              <p>
                이해도: <strong>{UNDERSTANDING_LABELS[r.understanding]}</strong>
              </p>
            ) : (
              r.legacyText && <p className="reflection-box">{r.legacyText}</p>
            )}
            <div className="reflection-chips">
              {r.checks.length === 0 && r.understanding && <span className="session-empty">체크한 항목 없음</span>}
              {r.checks.map((c) => (
                <Badge key={c} tone="brand">✓ {reflectionLabel(c)}</Badge>
              ))}
            </div>
            {r.remainingQuestions.length > 0 && (
              <div>
                <p className="session-sub">남은 궁금증</p>
                <ul className="reflection-list">
                  {r.remainingQuestions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              </div>
            )}
            {r.note && <p className="reflection-box">참고: {r.note}</p>}
          </div>
        )}
      </Card>

      {quiz.data && <QuizResult attempt={quiz.data} collapsed />}

      <div ref={setFbEl}>
        <Card>
          <h3 className="session-h3">선생님 피드백</h3>
          {fb.data?.length === 0 && <p className="session-empty">아직 피드백이 없어요</p>}
          {fb.data?.map((f) => (
            <div key={f.id} className="feedback">
              {newIds.has(f.id) && <Badge tone="brand">새 피드백</Badge>}
              <p className="feedback-text">{f.content}</p>
              <small className="feedback-date">{formatDateTime(f.createdAt)}</small>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
