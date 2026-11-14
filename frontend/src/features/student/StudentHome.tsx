import { useState, type ReactNode } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { api } from "../../api";
import { useMe } from "../../auth/session";
import { Icon } from "../../components/Icon";
import { Badge, ButtonLink, EmptyState, ErrorState, Spinner } from "../../components/ui";
import { activityLabel, goalLabel } from "../../lib/checklists";
import { elapsedLabel, formatDateTime, formatDuration } from "../../lib/time";
import { PaceCard } from "../records/PaceCard";
import { TOPIC_SIGNAL } from "../records/TopicGrowthView";
import { latestAttempt, summarizeWeek, unreadFeedback } from "../../lib/studentHome";
import { FEATURES } from "../../api";
import type { TopicGrowth } from "../../types/domain";

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
  // '오늘 할 일'의 남은 질문: 같은 최근 학습 5개 중 끝난 학습의 돌아보기에 적은 남은 질문 (기록 상세와 같은 캐시)
  const reflQueries = useQueries({
    queries: fbSessions.map((s) => ({ queryKey: ["reflection", s.id], queryFn: () => api.getReflection(s.id), enabled: s.status === "ENDED", staleTime: HOME_STALE })),
  });
  const fbLoading = fbQueries.some((q) => q.isLoading);
  const fbError = fbQueries.find((q) => q.error);
  const quizLoading = quizQueries.some((q) => q.isLoading) || growth.isLoading;
  const quizError = quizQueries.find((q) => q.error) ?? (growth.error ? growth : undefined);
  const reflLoading = reflQueries.some((q) => q.isLoading);
  const reflError = reflQueries.find((q) => q.error);
  const week = summarizeWeek(sessions.data ?? [], new Date());
  const lastQuiz = latestAttempt(quizQueries.map((q) => q.data));
  const lastQuizName = growth.data?.topics.find((t) => t.topicId === lastQuiz?.topicId)?.name;
  const fb = unreadFeedback(fbQueries.flatMap((q) => q.data ?? []));
  const openQuestions = reflQueries.reduce((n, q) => n + (q.data?.remainingQuestions.filter((t) => t.trim()).length ?? 0), 0);
  const fbBySession = new Map(fbSessions.map((s, i) => [s.id, fbQueries[i]?.data ?? []]));
  const fbSessionGoal = fb.latest ? fbSessions.find((s) => s.id === fb.latest?.sessionId) : undefined;

  return (
    <div className="stu-home">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{todayLabel()}</p>
          <h1>{me.data?.name} 학생, 안녕하세요</h1>
          <p>오늘도 내 속도에 맞게 한 걸음 시작해 볼까요?</p>
        </div>
      </div>

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
      ) : null}

      {sessions.isLoading ? null : sessions.error ? null : (
        <section className="student-task-panel stu-task-panel" aria-labelledby="stu-task-title">
          <div className="task-panel-top">
            <div>
              <small>오늘 할 일</small>
              <strong id="stu-task-title" aria-live="polite">
                {fbLoading || reflLoading ? (
                  "오늘 할 일을 모으고 있어요"
                ) : fbError || reflError ? (
                  "오늘 할 일을 다 불러오지 못했어요"
                ) : fb.count + openQuestions > 0 ? (
                  <>
                    오늘 할 일이 <em>{fb.count + openQuestions}</em>개 있어요
                  </>
                ) : (
                  "오늘 할 일을 모두 확인했어요"
                )}
              </strong>
            </div>
            <Link to="/student/records" className="stu-task-all">
              전체 기록 <Icon name="chevron" size={15} />
            </Link>
          </div>
          {!fbLoading && !reflLoading && (fbError || reflError) ? (
            <p>
              <button
                type="button"
                className="stat-retry"
                onClick={() => [...fbQueries, ...reflQueries].forEach((q) => q.error && q.refetch())}
              >
                다시 시도
              </button>
            </p>
          ) : (
            <>
              {(fb.count > 0 || openQuestions > 0) && (
                <div className="task-chips">
                  {fb.count > 0 && fb.latest && (
                    <Link to={`/student/records?session=${fb.latest.sessionId}`} className="stu-task-chip is-on">
                      새 피드백 {fb.count}
                    </Link>
                  )}
                  {openQuestions > 0 && (
                    <Link to="/student/records?tab=notes" className="stu-task-chip">
                      남은 질문 {openQuestions}
                    </Link>
                  )}
                </div>
              )}
              <p>
                {fb.latest && fbSessionGoal
                  ? `${goalLabel(fbSessionGoal.goal)} 기록에 선생님이 피드백을 남겼어요.`
                  : openQuestions > 0
                    ? "돌아보기에 적어 둔 남은 질문부터 풀어 볼까요?"
                    : "최근 학습 5개를 기준으로 새 피드백과 남은 질문을 모아 보여 줘요."}
              </p>
            </>
          )}
          {/* 학습 중인지 모를 때(불러오는 중·오류)는 새 시작을 권하지 않는다. 학습 중이면 위 카드에 '학습 화면으로'가 있다 */}
          {!active.isLoading && !active.error && !active.data && (
            <ButtonLink to="/student/start">
              학습 시작 <Icon name="chevron" size={16} />
            </ButtonLink>
          )}
        </section>
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
                  {fb.latest.authorSubject && <small className="subj-author">{fb.latest.authorSubject} 선생님</small>}
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

      {FEATURES.quiz && studentId && (
        <TopicGrowthGrid
          loading={growth.isLoading}
          error={growth.error}
          onRetry={() => growth.refetch()}
          shared={growth.data?.shared ?? true}
          topics={growth.data?.topics ?? []}
        />
      )}

      <PaceCard studentId={studentId} title="나의 성장 페이스" />

      <section>
        <div className="section-title">
          <h2>최근 학습</h2>
          <Link to="/student/records" className="stu-section-link">
            전체 보기 <Icon name="chevron" size={15} />
          </Link>
        </div>
        {sessions.isLoading && <Spinner />}
        {sessions.error && <ErrorState error={sessions.error} onRetry={() => sessions.refetch()} />}
        {sessions.data && recent.length === 0 && <EmptyState title="아직 끝낸 학습이 없어요" />}
        {recent.length > 0 && (
          <div className="record-list card">
            {recent.map((s) => {
              const d = new Date(s.startedAt);
              const fbList = fbBySession.get(s.id) ?? [];
              const unread = fbList.some((f) => !f.readAt);
              return (
                <Link key={s.id} to={`/student/records?session=${s.id}`} className="record-row">
                  <span className="date-box">
                    <strong>{d.getDate()}</strong>
                    <small>{d.getMonth() + 1}월</small>
                  </span>
                  <span className="record-main">
                    <small>{formatDateTime(s.startedAt)}</small>
                    <strong>{goalLabel({ ...s.goal, activities: [] })}</strong>
                    <span>
                      <Icon name="clock" size={15} />
                      {formatDuration(s.durationMinutes ?? 0)}
                      {s.goal.activities.length > 0 && ` · ${s.goal.activities.map(activityLabel).join(", ")}`}
                    </span>
                  </span>
                  {fbList.length > 0 && <Badge tone={unread ? "brand" : "stone"}>{unread ? "새 피드백" : "피드백"}</Badge>}
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

const HOME_TOPICS = 6; // 홈에는 주제 6개까지만, 나머지는 기록 화면에서

const pct = (r: number | null) => (r === null ? null : Math.round(r * 100));

/** 홈 '주제별 성장' 카드 묶음: AI가 기록에서 찾은 주제(TopicGrowth)를 그대로 보여 준다. 과목 고르기는 받은 데이터 안에서만 */
function TopicGrowthGrid({
  loading,
  error,
  onRetry,
  shared,
  topics,
}: {
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  shared: boolean;
  topics: TopicGrowth[];
}) {
  const [subject, setSubject] = useState<string | null>(null);
  const subjects = [...new Set(topics.map((t) => t.subject).filter((s): s is string => !!s))];
  const shown = (subject ? topics.filter((t) => t.subject === subject) : topics).slice(0, HOME_TOPICS);
  if (!shared) return null;
  return (
    <section className="subject-growth-section" aria-labelledby="stu-growth-title">
      <div className="section-title">
        <h2 id="stu-growth-title">주제별 성장</h2>
        {subjects.length >= 2 ? (
          <div className="growth-filters stu-growth-filters" role="group" aria-label="과목 고르기">
            {[null, ...subjects].map((s) => (
              <button key={s ?? "all"} type="button" aria-pressed={subject === s} onClick={() => setSubject(s)}>
                {s ?? "과목 · 전체"}
              </button>
            ))}
          </div>
        ) : (
          <span>확인 테스트는 성적에 들어가지 않아요</span>
        )}
      </div>
      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorState error={error} onRetry={onRetry} />
      ) : topics.length === 0 ? (
        <p className="card growth-empty">아직 주제가 없어요. 학습을 마치면 AI가 기록에서 주제를 찾아요.</p>
      ) : (
        <>
          <div className="subject-growth-grid">
            {shown.map((t) => {
              const rate = pct(t.lastRate);
              return (
                <article className="card subject-card stu-subject-card" key={t.topicId}>
                  <div>
                    <span>{t.subject ?? "주제"}</span>
                    <small>
                      {t.sessions}회 · {formatDuration(t.minutes)}
                    </small>
                  </div>
                  <h3>{t.name}</h3>
                  <p>{t.signal ? TOPIC_SIGNAL[t.signal].studentHint : rate === null ? "아직 확인 테스트를 보지 않았어요." : "최근 확인 테스트에서 맞힌 비율이에요."}</p>
                  <div className="progress-line" aria-hidden="true">
                    <span style={{ width: `${rate ?? 0}%` }} />
                  </div>
                  <strong>
                    <span className="stu-sr-only">최근 확인 테스트 </span>
                    {rate === null ? "-" : `${rate}%`}
                  </strong>
                  <div className="subject-chips">
                    {t.signal && <span>{TOPIC_SIGNAL[t.signal].label}</span>}
                    <span>학습 {t.sessions}번</span>
                    <span>테스트 {t.attempts}번</span>
                  </div>
                </article>
              );
            })}
          </div>
          {topics.length > HOME_TOPICS && !subject && (
            <p className="stu-growth-more">
              <Link to="/student/records">주제 {topics.length}개 모두 보기 →</Link>
            </p>
          )}
        </>
      )}
    </section>
  );
}

/** 서울 날짜 기준 "11월 14일 토요일" */
function todayLabel() {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "long" }).format(new Date());
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
