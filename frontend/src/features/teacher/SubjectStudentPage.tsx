import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { api } from "../../api";
import { Icon } from "../../components/Icon";
import { Badge, Button, EmptyState, ErrorState, Spinner } from "../../components/ui";
import { goalLabel, reflectionLabel, UNDERSTANDING_LABELS } from "../../lib/checklists";
import { classLabel } from "../../lib/classLabel";
import { formatDateTime, formatDuration, formatTime } from "../../lib/time";
import type { LearningSession } from "../../types/domain";

const KIND: Record<string, string> = { MEMO: "메모", QUESTION: "궁금한 점", QUIZ: "짧은 테스트", PAPER: "종이에 기록" };

export function SubjectStudentPage() {
  const { classId = "", subject = "", studentId = "" } = useParams();
  const sessions = useQuery({
    queryKey: ["sessions", studentId, subject],
    queryFn: () => api.listSessions({ studentId, subject }),
  });
  const students = useQuery({ queryKey: ["subject-students", classId, subject], queryFn: () => api.listSubjectStudents(classId, subject) });
  const student = students.data?.find((s) => s.id === studentId);
  const [openId, setOpenId] = useState<string | null>(null);

  // 열람 기록은 이 화면을 열 때 한 번만 (StrictMode 이중 실행에도 ref로 막는다). 실패하면 다음에 열 때 다시 시도
  const logged = useRef(false);
  useEffect(() => {
    if (logged.current) return;
    logged.current = true;
    api.logStudentView(studentId, subject).catch(() => {
      logged.current = false;
    });
  }, [studentId, subject]);

  const back = `/teacher/subjects/${classId}/${encodeURIComponent(subject)}`;
  return (
    <div className="subj-page">
      <Link to={back} className="student-back">
        ← {classLabel(classId)} {subject}
      </Link>
      <h1>{student ? `${student.number}번 ${student.name}` : "학생 기록"}</h1>
      <p className="subj-notice">
        <Icon name="lock" size={14} />
        <span>학생이 '교사 공개'로 남긴 {subject} 학습 기록만 보여요 · 열람 기록이 남아요</span>
      </p>

      {sessions.isLoading && <Spinner />}
      {sessions.error && <ErrorState error={sessions.error} onRetry={() => sessions.refetch()} />}
      {sessions.data?.length === 0 && <EmptyState title={`열람할 ${subject} 학습 기록이 없어요`}>학생이 동의하지 않았거나 이번 학기 기록이 없어요.</EmptyState>}
      {sessions.data && sessions.data.length > 0 && (
        <ul className="subj-sessions" aria-label={`${subject} 학습 목록`}>
          {sessions.data.map((s) => (
            <li key={s.id} className="card">
              <button
                className="subj-session-head"
                aria-expanded={openId === s.id}
                aria-controls={`subj-s-${s.id}`}
                onClick={() => setOpenId(openId === s.id ? null : s.id)}
              >
                <small>{formatDateTime(s.startedAt)}</small>
                <strong>{goalLabel(s.goal)}</strong>
                <span>{s.status === "ACTIVE" ? "학습 중" : formatDuration(s.durationMinutes ?? 0)}</span>
              </button>
              {openId === s.id && (
                <div id={`subj-s-${s.id}`} className="subj-session-body">
                  <SessionBody session={s} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SessionBody({ session }: { session: LearningSession }) {
  const entries = useQuery({ queryKey: ["entries", session.id], queryFn: () => api.listEntries(session.id) });
  const refl = useQuery({ queryKey: ["reflection", session.id], queryFn: () => api.getReflection(session.id) });
  const fb = useQuery({ queryKey: ["feedback", session.id], queryFn: () => api.listFeedback(session.id) });
  const r = refl.data;
  return (
    <>
      <section aria-label="공개된 기록">
        <h3 className="subj-sub">공개된 기록</h3>
        {entries.isLoading && <Spinner />}
        {entries.error && <ErrorState error={entries.error} onRetry={() => entries.refetch()} />}
        {entries.data?.length === 0 && <p className="subj-empty">공개된 기록이 없어요</p>}
        {entries.data && entries.data.length > 0 && (
          <ol className="subj-entries">
            {entries.data.map((e) => (
              <li key={e.id}>
                <span className="subj-time">{formatTime(e.createdAt)}</span>{" "}
                <Badge tone={e.kind === "QUESTION" ? "amber" : "stone"}>{KIND[e.kind] ?? e.kind}</Badge>
                <p>{e.content || (e.kind === "PAPER" ? "공책·학습지에 직접 정리" : "")}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-label="돌아보기">
        <h3 className="subj-sub">돌아보기</h3>
        {refl.isLoading && <Spinner />}
        {refl.error && <ErrorState error={refl.error} onRetry={() => refl.refetch()} />}
        {!refl.isLoading && !refl.error && !r && <p className="subj-empty">아직 돌아보기를 하지 않았어요</p>}
        {r && (
          <div>
            {r.understanding ? (
              <p>
                이해도: <strong>{UNDERSTANDING_LABELS[r.understanding]}</strong>
              </p>
            ) : (
              r.legacyText && <p>{r.legacyText}</p>
            )}
            <div className="subj-chips">
              {r.checks.map((c) => (
                <Badge key={c} tone="brand">
                  ✓ {reflectionLabel(c)}
                </Badge>
              ))}
            </div>
            {r.remainingQuestions.length > 0 && (
              <ul className="subj-list">
                {r.remainingQuestions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            )}
            {r.note && <p>참고: {r.note}</p>}
          </div>
        )}
      </section>

      <section aria-label="피드백">
        <h3 className="subj-sub">선생님 피드백</h3>
        {fb.isLoading && <Spinner />}
        {fb.error && <ErrorState error={fb.error} onRetry={() => fb.refetch()} />}
        {fb.data?.length === 0 && <p className="subj-empty">아직 피드백이 없어요</p>}
        {fb.data?.map((f) => (
          <div key={f.id} className="feedback">
            {f.authorSubject && <small className="subj-author">{f.authorSubject} 선생님</small>}
            <p className="feedback-text">{f.content}</p>
            <small className="feedback-date">{formatDateTime(f.createdAt)}</small>
          </div>
        ))}
        <FeedbackInput sessionId={session.id} />
      </section>
    </>
  );
}

function FeedbackInput({ sessionId }: { sessionId: string }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const add = useMutation({
    mutationFn: (content: string) => api.addFeedback(sessionId, content),
    onMutate: () => setText(""),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feedback", sessionId] }),
    onError: (_e, sent) => setText((cur) => cur || sent),
  });
  const id = `subj-fb-${sessionId}`;
  return (
    <div className="feedback-compose">
      <label htmlFor={id}>
        <h3>피드백 남기기</h3>
      </label>
      <textarea id={id} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} rows={3} placeholder="학생의 기록에 답해 주세요" />
      {add.error && <ErrorState error={add.error} />}
      <Button disabled={!text.trim() || add.isPending} onClick={() => add.mutate(text)}>
        피드백 보내기
      </Button>
    </div>
  );
}
