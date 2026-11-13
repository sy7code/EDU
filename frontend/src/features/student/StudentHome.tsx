import type { ReactNode } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { api } from "../../api";
import { useMe } from "../../auth/session";
import { Icon } from "../../components/Icon";
import { Badge, ButtonLink, EmptyState, ErrorState, PageTitle, Spinner } from "../../components/ui";
import { activityLabel, goalLabel } from "../../lib/checklists";
import { elapsedLabel, formatDateTime, formatDuration } from "../../lib/time";
import { latestAttempt, summarizeWeek, unreadFeedback } from "../../lib/studentHome";
import { FEATURES } from "../../api";

export function StudentHome() {
  const me = useMe();
  const active = useQuery({ queryKey: ["active-session"], queryFn: () => api.getActiveSession() });
  const sessions = useQuery({ queryKey: ["sessions", "me"], queryFn: () => api.listSessions({}) });

  const recent = (sessions.data ?? []).filter((s) => s.status === "ENDED").slice(0, 3);
  const studentId = me.data?.id;
  const growth = useQuery({
    queryKey: ["topic-growth", studentId],
    queryFn: () => api.getTopicGrowth(studentId!),
    enabled: !!studentId && FEATURES.quiz,
    staleTime: HOME_STALE,
  });
  // 피드백은 세션마다 따로 불러야 해서 최근 학습 5개(진행 중 포함)만 본다. 화면 문구에도 범위를 밝힌다
  const fbSessions = (sessions.data ?? []).slice(0, 5);
  const fbQueries = useQueries({
    queries: fbSessions.map((s) => ({ queryKey: ["feedback", s.id], queryFn: () => api.listFeedback(s.id), staleTime: HOME_STALE })),
  });
  // 최근 확인 테스트도 같은 최근 학습 5개에서 찾는다 (성장 데이터엔 날짜가 없어 순서를 알 수 없음)
  const quizQueries = useQueries({
    queries: fbSessions.map((s) => ({ queryKey: ["quiz-attempt", s.id], queryFn: () => api.getQuizAttempt(s.id), enabled: FEATURES.quiz && s.status === "ENDED", staleTime: HOME_STALE })),
  });
  const fbLoading = fbQueries.some((q) => q.isLoading);
  const fbError = fbQueries.find((q) => q.error);
  const quizLoading = quizQueries.some((q) => q.isLoading) || growth.isLoading;
  const quizError = quizQueries.find((q) => q.error) ?? (growth.error ? growth : undefined);
  const week = summarizeWeek(sessions.data ?? [], new Date());
  const lastQuiz = latestAttempt(quizQueries.map((q) => q.data));
  const lastQuizName = growth.data?.topics.find((t) => t.topicId === lastQuiz?.topicId)?.name;
  const fb = unreadFeedback(fbQueries.flatMap((q) => q.data ?? []));

  return (
    <div>
      <PageTitle sub="오늘은 무엇을 스스로 공부해 볼까요?">{me.data?.name} 학생, 안녕하세요</PageTitle>

      {active.isLoading ? (
        <Spinner />
      ) : active.error ? (
        <ErrorState error={active.error} onRetry={() => active.refetch()} />
      ) : active.data ? (
        <div className="start-card home-active">
          <span className="start-icon">
            <Icon name="clock" size={26} />
          </span>
          <span>
            <small>
              <Badge tone="brand">학습 중</Badge>
            </small>
            <strong>{goalLabel(active.data.goal)}</strong>
            <em>{elapsedLabel(active.data.startedAt)} 째 공부하고 있어요</em>
          </span>
          <ButtonLink to={`/student/session/${active.data.id}`}>학습 화면으로</ButtonLink>
        </div>
      ) : (
        <div className="start-card home-start">
          <span className="start-icon">
            <Icon name="pen" size={26} />
          </span>
          <span>
            <small>오늘의 학습</small>
            <strong>새 학습 시작하기</strong>
            <em>목표를 고르고, 자습실 단말기에서 인증하면 시작돼요.</em>
          </span>
          <ButtonLink to="/student/start">학습 시작</ButtonLink>
        </div>
      )}

      {sessions.data && (
        <section>
          <div className="section-title">
            <h2>나의 학습 요약</h2>
            <span>최근 7일</span>
          </div>
          <div className="stats-grid">
            <StatCard label="최근 7일 학습" icon="clock">
              <strong className="stat-value">{week.count}회</strong>
              <p>{week.count ? formatDuration(week.minutes) : "최근 7일 동안은 아직이에요"}</p>
            </StatCard>
            {FEATURES.quiz && (
              <StatCard label="최근 확인 테스트" icon="check" tone="blue-tone">
                {quizLoading ? (
                  <strong className="stat-value">-</strong>
                ) : quizError ? (
                  <LoadFailed onRetry={() => quizQueries.forEach((q) => q.refetch())} />
                ) : lastQuiz ? (
                  <>
                    <strong className="stat-value">
                      {lastQuiz.correct} / {lastQuiz.total}
                    </strong>
                    <p className="truncate">
                      {lastQuizName ? `${lastQuizName} · ` : ""}
                      {formatDateTime(lastQuiz.createdAt)}
                    </p>
                  </>
                ) : (
                  <p className="stat-empty">학습을 마치고 확인 테스트를 보면 여기 나와요</p>
                )}
              </StatCard>
            )}
            {fbLoading ? (
              <StatCard label="선생님 피드백" icon="message" tone="orange-tone">
                <strong className="stat-value">-</strong>
              </StatCard>
            ) : fbError ? (
              <StatCard label="선생님 피드백" icon="message" tone="orange-tone">
                <LoadFailed onRetry={() => fbQueries.forEach((q) => q.refetch())} />
              </StatCard>
            ) : fb.latest ? (
              <Link to={`/student/records?session=${fb.latest.sessionId}`} className="stat-link">
                <StatCard
                  label="선생님 피드백"
                  icon="message"
                  tone="orange-tone"
                  badge={<Badge tone="brand">새 피드백 {fb.count}개</Badge>}
                >
                  <p className="line-clamp-2 stat-quote">{fb.latest.content}</p>
                  <p className="stat-more">기록에서 보기 →</p>
                </StatCard>
              </Link>
            ) : (
              <StatCard label="선생님 피드백" icon="message" tone="orange-tone">
                <p className="stat-empty">최근 학습 5개에 새 피드백이 없어요</p>
              </StatCard>
            )}
          </div>
        </section>
      )}

      <section>
        <div className="section-title">
          <h2>최근 학습</h2>
        </div>
        {sessions.isLoading && <Spinner />}
        {sessions.error && <ErrorState error={sessions.error} onRetry={() => sessions.refetch()} />}
        {sessions.data && recent.length === 0 && <EmptyState title="아직 끝낸 학습이 없어요" />}
        {recent.length > 0 && (
          <div className="record-list card">
            {recent.map((s) => {
              const d = new Date(s.startedAt);
              return (
                <Link key={s.id} to={`/student/records?session=${s.id}`} className="record-row">
                  <span className="date-box">
                    <strong>{d.getDate()}</strong>
                    <small>{d.getMonth() + 1}월</small>
                  </span>
                  <span className="record-main">
                    <small>{formatDateTime(s.startedAt)}</small>
                    <strong>{s.goal.subject}</strong>
                    <span>
                      <Icon name="clock" size={15} />
                      {formatDuration(s.durationMinutes ?? 0)}
                      {s.goal.activities.length > 0 && ` · ${s.goal.activities.map(activityLabel).join(", ")}`}
                    </span>
                  </span>
                  <Icon name="chevron" size={18} />
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({
  label,
  icon,
  tone = "",
  badge,
  children,
}: {
  label: string;
  icon: string;
  tone?: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <article className={`card stat-card ${tone}`}>
      <div className="stat-head">
        <span className="stat-icon">
          <Icon name={icon} />
        </span>
        <span>{label}</span>
        {badge}
      </div>
      {children}
    </article>
  );
}

const HOME_STALE = 60_000; // 홈과 기록을 오갈 때 같은 요청을 1분 동안 재사용

function LoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <p className="stat-empty">
      불러오지 못했어요.{" "}
      <button className="stat-retry" onClick={onRetry}>
        다시 시도
      </button>
    </p>
  );
}
