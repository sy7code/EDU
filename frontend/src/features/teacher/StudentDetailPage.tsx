import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router";
import { api, FEATURES } from "../../api";
import { Icon } from "../../components/Icon";
import { Button, EmptyState, ErrorState, Spinner } from "../../components/ui";
import { goalLabel } from "../../lib/checklists";
import { formatDateTime, formatDuration } from "../../lib/time";
import { SessionDetail } from "../records/SessionDetail";
import { TopicGrowthView } from "../records/TopicGrowthView";
import { AssessmentPanel } from "./AssessmentPanel";
import { ProfileSummary, QuestionList, useQuestionCountBySession } from "./StudentProfile";
import { studentDetailTab } from "../../lib/tabs";

const TABS = ["summary", "records", "questions"] as const;
const TAB_LABEL: Record<(typeof TABS)[number], string> = { summary: "요약", records: "학습 기록", questions: "AI 질문" };

export function StudentDetailPage() {
  const { studentId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const [highlight, setHighlight] = useState<string[]>([]);
  const sessions = useQuery({ queryKey: ["sessions", studentId], queryFn: () => api.listSessions({ studentId }) });
  const dash = useQuery({ queryKey: ["dashboard-name", studentId], queryFn: async () => {
    const me = await api.me();
    const d = await api.getDashboard(me!.classId);
    return d.students.find((s) => s.studentId === studentId) ?? null;
  } });

  const qCount = useQuestionCountBySession(studentId);
  // ?session= 만 붙은 예전 링크는 학습 기록 탭으로, 잘못된 tab 값은 요약 탭으로
  const tab = studentDetailTab(params.get("tab"), params.get("session"));
  const fromAnalytics = params.get("from") === "analytics";
  const go = (next: Record<string, string>) =>
    setParams({ tab, ...(params.get("session") ? { session: params.get("session")! } : {}), ...(fromAnalytics ? { from: "analytics" } : {}), ...next });
  const detailRef = useRef<HTMLDivElement>(null);
  // 학생 상세를 열면 열람 기록을 남긴다 (학생이 '동의 설정'에서 볼 수 있음). 같은 학생은 한 번만
  const logged = useRef<string | null>(null);
  useEffect(() => {
    if (!FEATURES.audit || logged.current === studentId) return;
    logged.current = studentId;
    api.logStudentView(studentId).catch(() => {
      // 기록이 실패하면 다음에 이 화면을 열 때 다시 시도한다
      if (logged.current === studentId) logged.current = null;
    });
  }, [studentId]);
  const chooseSession = (id: string) => {
    go({ session: id });
    // 목록과 상세가 위아래로 쌓이는 폭(1100px 이하, styles 참고)에서는 목록 아래에 상세가 있어 골라도 반응이 없어 보이므로 상세로 내려간다
    if (window.matchMedia("(max-width: 1100px)").matches) {
      requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  };
  const selectedId = params.get("session") ?? sessions.data?.[0]?.id;
  const selected = sessions.data?.find((s) => s.id === selectedId);

  useEffect(() => setHighlight([]), [selectedId]);
  useEffect(() => {
    if (highlight[0]) document.getElementById(`ev-${highlight[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlight]);

  const name = dash.data ? `${dash.data.number}번 ${dash.data.name}` : "학생 기록";
  return (
    <div className="page teacher-page">
      <Link to={fromAnalytics ? "/teacher/analytics" : "/teacher"} className="student-back">
        ← {fromAnalytics ? "반 분석" : "반 대시보드"}
      </Link>
      <div className="student-profile-head">
        <div className="avatar" aria-hidden="true">{dash.data ? String(dash.data.number).padStart(2, "0") : "-"}</div>
        <div>
          <h1>{name}</h1>
          <p>
            {FEATURES.audit && <Icon name="lock" size={14} />}
            {`학생이 '교사 공개'로 남긴 기록만 보여요${FEATURES.audit ? " · 열람 기록이 남아요" : ""}`}
          </p>
        </div>
      </div>
      <nav className="tabs wide" aria-label="학생 정보 보기">
        {TABS.map((t) => (
          <button
            key={t}
            aria-current={tab === t ? "page" : undefined}
            onClick={() => {
              setHighlight([]);
              go({ tab: t });
            }}
            className={tab === t ? "active" : ""}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </nav>

      {tab === "summary" && (
        <>
          <ProfileSummary studentId={studentId} />
          {FEATURES.quiz && <TopicGrowthView studentId={studentId} viewer="teacher" />}
        </>
      )}

      {tab === "questions" && <QuestionList studentId={studentId} />}

      {tab === "records" && (
        <>
          {sessions.isLoading && <Spinner />}
          {sessions.error && <ErrorState error={sessions.error} onRetry={() => sessions.refetch()} />}
          {sessions.data?.length === 0 && <EmptyState title="학습 기록이 없어요">먼저 학생과 학습 계획을 이야기해 보세요.</EmptyState>}
          {sessions.data && sessions.data.length > 0 && (
            <div className="card split-record">
              <div className="session-list">
                <h2>학습 목록</h2>
                <p className="session-list-note">AI 질문 수는 최근 4주 학습에만 표시돼요</p>
                <ul>
                  {sessions.data.map((s) => (
                    <li key={s.id}>
                      <button onClick={() => chooseSession(s.id)} className={s.id === selectedId ? "active" : ""}>
                        <small>{formatDateTime(s.startedAt)}</small>
                        <strong>{goalLabel(s.goal)}</strong>
                        <span>
                          {s.status === "ACTIVE" ? "학습 중" : formatDuration(s.durationMinutes ?? 0)}
                          {qCount.get(s.id) ? ` · AI 질문 ${qCount.get(s.id)}회` : null}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              {selected && (
                <div ref={detailRef} className="session-detail scroll-mt-4">
                  <FeedbackForm sessionId={selected.id} />
                  <SessionDetail session={selected} highlight={highlight} />
                  {FEATURES.assessment && <AssessmentPanel session={selected} onEvidence={setHighlight} />}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FeedbackForm({ sessionId }: { sessionId: string }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const add = useMutation({
    mutationFn: (content: string) => api.addFeedback(sessionId, content),
    onMutate: () => setText(""),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feedback", sessionId] }),
    onError: (_e, sent) => setText((cur) => cur || sent),
  });
  return (
    <div className="feedback-compose">
      <h3>피드백 남기기</h3>
      <p>학생의 질문과 돌아보기에 답해 주세요</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={2000}
        rows={3}
        placeholder="예: 남긴 질문 좋아요. 판별식은 다음 시간에 같이 봐요."
      />
      {add.error && <ErrorState error={add.error} />}
      <Button disabled={!text.trim() || add.isPending} onClick={() => add.mutate(text)}>
        피드백 보내기
      </Button>
    </div>
  );
}
