import { useRef } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { api, FEATURES } from "../../api";
import { useMe } from "../../auth/session";
import { TopicGrowthView } from "./TopicGrowthView";
import { Icon } from "../../components/Icon";
import { Badge, Card, EmptyState, ErrorState, Spinner } from "../../components/ui";
import { goalLabel } from "../../lib/checklists";
import { formatDateTime, formatDuration } from "../../lib/time";
import { SessionDetail } from "./SessionDetail";
import { NotesView } from "./NotesView";
import { myRecordsTab } from "../../lib/tabs";
import { AssessmentView } from "../teacher/AssessmentPanel";

export function MyRecordsPage() {
  const [params, setParams] = useSearchParams();
  const me = useMe();
  const sessions = useQuery({ queryKey: ["sessions", "me"], queryFn: () => api.listSessions({}) });
  const tab = myRecordsTab(params.get("tab"));
  const selectedId = params.get("session") ?? sessions.data?.[0]?.id;
  const selected = sessions.data?.find((s) => s.id === selectedId);
  const totalMin = (sessions.data ?? []).reduce((n, s) => n + (s.durationMinutes ?? 0), 0);
  const detailRef = useRef<HTMLDivElement>(null);
  // 피드백 배지는 홈과 같은 캐시를 쓰고, 최근 학습 5개(진행 중 포함)만 확인한다
  const fbSessions = (sessions.data ?? []).slice(0, 5);
  const fbQueries = useQueries({
    queries: fbSessions.map((s) => ({ queryKey: ["feedback", s.id], queryFn: () => api.listFeedback(s.id), staleTime: 60_000 })),
  });
  const hasFeedback = new Set(fbSessions.filter((_, i) => (fbQueries[i]?.data?.length ?? 0) > 0).map((s) => s.id));
  const hasUnread = new Set(fbSessions.filter((_, i) => fbQueries[i]?.data?.some((f) => !f.readAt)).map((s) => s.id));
  const choose = (id: string) => {
    setParams({ session: id });
    // 목록과 상세가 위아래로 쌓이는 폭(1100px 이하, styles 참고)에서는 목록 아래에 상세가 있어 골라도 반응이 없어 보이므로 상세로 내려간다
    if (window.matchMedia("(max-width: 1100px)").matches) {
      requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  };

  return (
    <div>
      <div className="page-heading">
        <div>
          <p className="eyebrow">나의 기록</p>
          <h1>{sessions.data ? `지금까지 ${sessions.data.length}번, ${formatDuration(totalMin)}` : "내 학습 기록"}</h1>
          <p>점수가 아니라, 내가 공부해 온 과정을 살펴보세요.</p>
        </div>
      </div>
      <nav className="tabs wide" aria-label="내 기록 보기">
        {(["list", "notes"] as const).map((t) => (
          <button
            key={t}
            aria-current={tab === t ? "page" : undefined}
            onClick={() => setParams(t === "notes" ? { tab: "notes" } : {})}
            className={tab === t ? "active" : ""}
          >
            {t === "list" ? "학습 목록" : "내 정리"}
          </button>
        ))}
      </nav>
      {tab === "notes" && <NotesView onOpenSession={choose} />}
      {tab === "list" && FEATURES.quiz && me.data && <TopicGrowthView studentId={me.data.id} viewer="student" />}
      {tab === "list" && sessions.isLoading && <Spinner />}
      {tab === "list" && sessions.error && <ErrorState error={sessions.error} onRetry={() => sessions.refetch()} />}
      {tab === "list" && sessions.data?.length === 0 && <EmptyState title="아직 기록이 없어요">홈에서 첫 학습을 시작해 보세요.</EmptyState>}
      {tab === "list" && sessions.data && sessions.data.length > 0 && (
        <section>
          <div className="section-title">
            <h2>학습 목록</h2>
            <span>{sessions.data.length}개</span>
          </div>
          <div className="my-records">
            <div className="card record-list compact">
              {sessions.data.map((s) => (
                <button key={s.id} onClick={() => choose(s.id)} className={`record-row ${s.id === selectedId ? "selected" : ""}`}>
                  <span className="record-main">
                    <small>{formatDateTime(s.startedAt)}</small>
                    <strong>{goalLabel(s.goal)}</strong>
                    <span>{s.status === "ACTIVE" ? "학습 중" : formatDuration(s.durationMinutes ?? 0)}</span>
                  </span>
                  {hasFeedback.has(s.id) && (
                    <Badge tone={hasUnread.has(s.id) ? "brand" : "stone"}>{hasUnread.has(s.id) ? "새 피드백" : "피드백"}</Badge>
                  )}
                  <Icon name="chevron" />
                </button>
              ))}
            </div>
            {selected && (
              <div ref={detailRef} className="my-records-detail">
                <SessionDetail session={selected} />
                <StudentAssessment sessionId={selected.id} />
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function StudentAssessment({ sessionId }: { sessionId: string }) {
  const a = useQuery({ queryKey: ["assessment", sessionId], queryFn: () => api.getAssessment(sessionId) });
  if (!a.data?.teacher) return null;
  return (
    <Card>
      <h3 className="records-card-title">선생님 관찰 평가</h3>
      <p className="records-card-sub">선생님이 확정한 내용이에요</p>
      <AssessmentView sessionId={sessionId} scores={a.data.teacher} />
    </Card>
  );
}
