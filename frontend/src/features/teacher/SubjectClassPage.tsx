import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { api } from "../../api";
import { Card, EmptyState, ErrorState, Spinner } from "../../components/ui";
import { classLabel } from "../../lib/classLabel";

export function SubjectClassPage() {
  const { classId = "", subject = "" } = useParams();
  const title = `${classLabel(classId)} ${subject}`;
  const summary = useQuery({ queryKey: ["subject-summary", classId, subject], queryFn: () => api.getSubjectSummary(classId, subject) });
  const students = useQuery({ queryKey: ["subject-students", classId, subject], queryFn: () => api.listSubjectStudents(classId, subject) });
  const s = summary.data;
  return (
    <div className="subj-page">
      <Link to="/teacher/subjects" className="student-back">
        ← 내 과목
      </Link>
      <h1>{title}</h1>

      <Card className="subj-card">
        <h2 className="subj-title">이번 주 주제별 학습</h2>
        {summary.isLoading && <Spinner />}
        {summary.error && <ErrorState error={summary.error} onRetry={() => summary.refetch()} />}
        {s?.few && <p className="subj-empty">이번 주 기록 적음</p>}
        {s && !s.few && (
          <>
            <p className="subj-review-line">
              이번 주 학습 {s.sessionCount}회 · 학습 학생 {s.studentCount === "적음" ? "적음" : `${s.studentCount}명`}
            </p>
            {s.topics.length === 0 ? (
              <p className="subj-empty">이번 주 주제별 기록이 아직 없어요</p>
            ) : (
              <div className="table-wrap">
                <table className="overview-table subj-table">
                  <caption className="sr-only">{title} 이번 주 주제별 학습 현황</caption>
                  <thead>
                    <tr>
                      <th scope="col">주제</th>
                      <th scope="col">학습 학생</th>
                      <th scope="col">다시 볼 후보</th>
                      <th scope="col">최근 정답률</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.topics.map((t) => (
                      <tr key={t.topicId ?? "none"}>
                        <th scope="row" className="subj-topic">
                          {t.name}
                        </th>
                        <td>{t.studentCount === "적음" ? "적음" : `${t.studentCount}명`}</td>
                        <td>{t.reviewCount === "적음" ? "적음" : `${t.reviewCount}명`}</td>
                        <td>{t.lastRate === null ? "-" : `${Math.round(t.lastRate * 100)}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Card>

      {s && !s.few && (
        <Card className="subj-card">
          <h2 className="subj-title">많이 틀린 문항</h2>
          {s.hardQuestions.length === 0 ? (
            <p className="subj-empty">응시 학생이 3명 이상인 문항 중 눈에 띄는 문항이 아직 없어요</p>
          ) : (
            <ol className="subj-hard">
              {s.hardQuestions.slice(0, 2).map((q) => (
                <li key={q.questionId}>
                  <p>{q.prompt}</p>
                  <small>
                    정답률 {Math.round(q.rate * 100)}% · 응시 {q.answered}명
                  </small>
                </li>
              ))}
            </ol>
          )}
        </Card>
      )}

      <Card className="subj-card">
        <h2 className="subj-title">기록을 공개한 학생</h2>
        <p className="subj-empty">학생이 학습 기록과 교과 공개에 모두 동의한 경우만 보여요.</p>
        {students.isLoading && <Spinner />}
        {students.error && <ErrorState error={students.error} onRetry={() => students.refetch()} />}
        {students.data?.length === 0 && <EmptyState title="열람할 수 있는 학생이 아직 없어요">학생이 동의하면 여기에 나타나요.</EmptyState>}
        {students.data && students.data.length > 0 && (
          <ul className="subj-students">
            {students.data.map((st) => (
              <li key={st.id}>
                <Link to={`/teacher/subjects/${classId}/${encodeURIComponent(subject)}/students/${st.id}`}>
                  {st.number}번 {st.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
