import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { api, FEATURES } from "../../api";
import { isRetryable } from "../../lib/retryable";
import { Badge, EmptyState, ErrorState, Spinner } from "../../components/ui";
import { classLabel } from "../../lib/classLabel";
import type { SubjectWeekSummary, TeacherAssignment } from "../../types/domain";

/** 후보가 많은 주제 3개. "적음"(1~2명)은 숫자 주제 뒤로 */
function topReviewTopics(s: SubjectWeekSummary): string[] {
  const weight = (c: number | "적음") => (c === "적음" ? 0.5 : c);
  return s.topics
    .filter((t) => t.reviewCount !== 0)
    .sort((a, b) => weight(b.reviewCount) - weight(a.reviewCount))
    .slice(0, 3)
    .map((t) => t.name);
}

export function SubjectsPage() {
  const asg = useQuery({ queryKey: ["my-assignments"], queryFn: () => api.listMyAssignments(), enabled: FEATURES.subjectTeacher });
  return (
    <div className="subj-page">
      <h1>내 과목</h1>
      <p className="subj-lead">이번 주 학습을 반·과목별로 모아 보여요. 학생이 '교사 공개'와 교과 공개에 동의한 기록만 집계돼요.</p>
      {!FEATURES.subjectTeacher && <EmptyState title="아직 쓸 수 없는 기능이에요">교과 선생님 화면은 준비 중이에요.</EmptyState>}
      {FEATURES.subjectTeacher && asg.isLoading && <Spinner />}
      {asg.error && <ErrorState error={asg.error} onRetry={isRetryable(asg.error) ? () => asg.refetch() : undefined} />}
      {asg.data?.length === 0 && <EmptyState title="맡은 과목이 없어요">이번 학기에 배정된 반·과목이 없어요.</EmptyState>}
      <div className="subj-card-grid">
        {asg.data?.map((a) => <AssignmentCard key={`${a.classId}/${a.subject}`} a={a} />)}
      </div>
    </div>
  );
}

function AssignmentCard({ a }: { a: TeacherAssignment }) {
  const q = useQuery({ queryKey: ["subject-summary", a.classId, a.subject], queryFn: () => api.getSubjectSummary(a.classId, a.subject), enabled: FEATURES.subjectTeacher });
  const title = `${classLabel(a.classId)} ${a.subject}`;
  const to = `/teacher/subjects/${a.classId}/${encodeURIComponent(a.subject)}`;
  const s = q.data;
  const topics = s && !s.few ? topReviewTopics(s) : [];
  const headId = `subj-a-${a.classId}-${a.subject}`;
  return (
    <section className="card card-pad subj-assign" aria-labelledby={headId}>
      <h2 id={headId} className="subj-title">
        <Link to={to}>{title}</Link>
      </h2>
      {q.isLoading && <Spinner />}
      {q.error && <ErrorState error={q.error} onRetry={isRetryable(q.error) ? () => q.refetch() : undefined} />}
      {s?.few && <Badge tone="stone">이번 주 기록 적음</Badge>}
      {s && !s.few && (
        <>
          <dl className="subj-kv">
            <div>
              <dt>이번 주 학습</dt>
              <dd>{s.sessionCount}회</dd>
            </div>
            <div>
              <dt>학습 학생</dt>
              <dd>{s.studentCount === "적음" ? "적음" : `${s.studentCount}명`}</dd>
            </div>
          </dl>
          <h3 className="subj-sub">다시 볼 후보가 많은 주제</h3>
          {topics.length === 0 ? (
            <p className="subj-empty">지금은 다시 볼 후보가 없어요</p>
          ) : (
            <ol className="subj-top">
              {topics.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ol>
          )}
        </>
      )}
      <Link className="subj-more" to={to}>
        자세히 보기 →
      </Link>
    </section>
  );
}
