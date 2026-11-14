import { useQuery } from "@tanstack/react-query";
import { api } from "../../api";
import { ErrorState, Spinner } from "../../components/ui";
import { reviewTopicsBySubject } from "../../lib/reviewTopics";

/** 학생 본인용: 과목별로 다시 볼 주제. 점수 순위가 아니라 복습의 출발점 */
export function SubjectReviewCard({ studentId }: { studentId: string }) {
  const q = useQuery({
    queryKey: ["review-inputs", studentId],
    queryFn: () => api.getReviewInputs(studentId),
  });
  if (q.error)
    return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <Spinner />;
  const groups = reviewTopicsBySubject(q.data);
  return (
    <section
      className="card card-pad subj-card"
      aria-label="과목별 다시 볼 주제"
    >
      <h2 className="subj-title">과목별 다시 볼 주제</h2>
      {groups.length === 0 ? (
        <p className="subj-empty">지금은 다시 볼 주제가 없어요</p>
      ) : (
        groups.map((g) => (
          <div key={g.subject} className="subj-group">
            <h3>{g.subject}</h3>
            <ul>
              {g.topics.map((t) => (
                <li key={t.topicId}>{`${g.subject} - ${t.name}`}</li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
