import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { api, FEATURES } from "../../api";
import { isRetryable } from "../../lib/retryable";
import { Badge, Button, Card, EmptyState, ErrorState, Spinner } from "../../components/ui";
import { classLabel } from "../../lib/classLabel";
import { themesHeaderLabel } from "../../lib/themesLabel";

/** 반 하나·과목 하나의 내용: 주제별 학습, 질문 핵심, 많이 틀린 문항, 기록을 공개한 학생 */
export function SubjectClassView({ classId, subject }: { classId: string; subject: string }) {
  const title = `${classLabel(classId)} ${subject}`;
  const summary = useQuery({ queryKey: ["subject-summary", classId, subject], queryFn: () => api.getSubjectSummary(classId, subject), enabled: FEATURES.subjectTeacher });
  const students = useQuery({ queryKey: ["subject-students", classId, subject], queryFn: () => api.listSubjectStudents(classId, subject), enabled: FEATURES.subjectTeacher });
  const qc = useQueryClient();
  const themesKey = ["subj", "question-themes", classId, subject];
  const themes = useQuery({ queryKey: themesKey, queryFn: () => api.getQuestionThemes(classId, subject), enabled: FEATURES.subjectTeacher && FEATURES.questionThemes });
  const generate = useMutation({
    mutationFn: () => api.generateQuestionThemes(classId, subject),
    onSuccess: (data) => qc.setQueryData(themesKey, data),
  });
  const t = generate.data ?? themes.data;
  const s = summary.data;
  return (
    <div className="subj-view">
      <Card className="subj-card">
        <h2 className="subj-title">이번 주 주제별 학습</h2>
        {summary.isLoading && <Spinner />}
        {summary.error && <ErrorState error={summary.error} onRetry={isRetryable(summary.error) ? () => summary.refetch() : undefined} />}
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

      {FEATURES.questionThemes && (
        <Card className="subj-card">
          <div className="qth-head">
            <h2 className="subj-title">이번 주 질문 핵심</h2>
            {t && (
              <Button variant="secondary" onClick={() => generate.mutate()} disabled={generate.isPending} aria-busy={generate.isPending}>
                {generate.isPending ? "만드는 중…" : t.status === "EMPTY" ? "요약 만들기" : "새로 만들기"}
              </Button>
            )}
          </div>
          <div aria-live="polite">
            {themes.isLoading && <Spinner />}
            {themes.error && <ErrorState error={themes.error} onRetry={isRetryable(themes.error) ? () => themes.refetch() : undefined} />}
            {generate.error && <ErrorState error={generate.error} onRetry={isRetryable(generate.error) ? () => generate.mutate() : undefined} />}
            {t?.status === "EMPTY" && <p className="subj-empty">아직 요약이 없어요</p>}
            {t?.status === "FEW" && <p className="subj-empty">질문한 학생이 적어 요약하지 않았어요</p>}
            {t?.status === "OK" && (
              <>
                <p className="qth-meta">{themesHeaderLabel(t.generatedAt)}</p>
                {t.themes.length === 0 ? (
                  <p className="subj-empty">공통으로 묶이는 질문이 아직 없어요</p>
                ) : (
                  <ul className="qth-list">
                    {t.themes.map((th, i) => (
                      <li key={`${th.title}-${i}`} className="qth-item">
                        <strong className="qth-core">{th.title}</strong>
                        <Badge tone="brand">학생 {th.studentCount}명</Badge>
                        {th.topicName && <Badge tone="sky">{th.topicName}</Badge>}
                      </li>
                    ))}
                  </ul>
                )}
                {t.hiddenCount > 0 && <p className="qth-note">학생이 적은 묶음 {t.hiddenCount}개는 보이지 않아요</p>}
              </>
            )}
            {t && <p className="qth-note">학생 이름과 원래 질문은 보여 주지 않아요</p>}
          </div>
        </Card>
      )}

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
        {students.error && <ErrorState error={students.error} onRetry={isRetryable(students.error) ? () => students.refetch() : undefined} />}
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
