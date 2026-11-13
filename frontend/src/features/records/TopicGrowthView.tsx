import { useQuery } from "@tanstack/react-query";
import { api } from "../../api";
import { Icon } from "../../components/Icon";
import { Badge, Card, ErrorState, Spinner } from "../../components/ui";
import { UNDERSTANDING_LABELS } from "../../lib/checklists";
import { formatDuration } from "../../lib/time";
import type { TopicGrowth } from "../../types/domain";

const pct = (r: number | null) => (r === null ? "-" : `${Math.round(r * 100)}%`);

const SIGNAL: Record<NonNullable<TopicGrowth["signal"]>, { label: string; teacherHint: string; studentHint: string }> = {
  OVERCONFIDENT: {
    label: "이해했다는데 점수 낮음",
    teacherHint: "스스로 '설명할 수 있다'고 했지만 확인 테스트가 60% 미만이에요. 오개념이 있는지 이야기해 보세요.",
    studentHint: "설명할 수 있다고 느꼈는데 테스트 결과는 조금 달랐어요. 틀린 문제 해설을 다시 볼까요?",
  },
  LOW_SCORE: {
    label: "다시 볼 주제",
    teacherHint: "확인 테스트가 40% 미만이에요. 이 주제를 함께 다시 살펴보면 좋아요.",
    studentHint: "이 주제는 한 번 더 보면 좋아요.",
  },
};

/** 주제별 성장: 학생 "내 성장" 카드 / 교사 학생 상세 표. 테스트는 성적이 아니라 대화·복습의 출발점 */
export function TopicGrowthView({ studentId, viewer }: { studentId: string; viewer: "student" | "teacher" }) {
  const g = useQuery({ queryKey: ["topic-growth", studentId], queryFn: () => api.getTopicGrowth(studentId) });
  if (g.error) return <ErrorState error={g.error} onRetry={() => g.refetch()} />;
  if (!g.data) return <Spinner />;
  const { shared, topics, total } = g.data;

  if (!shared) {
    return (
      <Card className="growth-section">
        <div className="conversation-signal">
          <Icon name="message" />
          <span>
            이 학생은 기록 공유에 동의하지 않아 주제별 성장은 보이지 않아요. 전체 {total.sessions}회 · {formatDuration(total.minutes)} 학습했어요.
          </span>
        </div>
      </Card>
    );
  }

  return (
    <section className="growth-section">
      <div className="section-title">
        <h2>{viewer === "student" ? "내 성장" : "주제별 성장"}</h2>
        <span>AI가 기록에서 찾은 주제별 · 확인 테스트는 모두에게 같은 난이도 · 성적에 들어가지 않아요</span>
      </div>
      {topics.length === 0 ? (
        <p className="card growth-empty">아직 주제가 없어요. 학습을 마치면 AI가 기록에서 주제를 찾아요.</p>
      ) : (
        <div className="growth-list">
          {topics.map((t) => {
            const up = t.firstRate !== null && t.lastRate !== null && t.attempts > 1 ? t.lastRate - t.firstRate : null;
            return (
              <div key={t.topicId} className="card growth-card">
                <div className="growth-badges">
                  <Badge tone="sky">{t.name}</Badge>
                  {t.subject && <span className="growth-subject">{t.subject}</span>}
                </div>
                <h3>{t.sessions}회 · {formatDuration(t.minutes)}</h3>
                <div className="growth-row">
                  <span>확인 테스트 {t.attempts}번</span>
                  <strong>
                    {t.attempts > 1 ? `${pct(t.firstRate)} → ${pct(t.lastRate)}` : pct(t.lastRate)}
                    {t.lastTotal !== null && t.lastTotal < 5 && <small className="growth-note">(최근 {t.lastTotal}문항 기준)</small>}
                    {up !== null && up !== 0 && (
                      <em className={up > 0 ? "growth-up" : "growth-down"}>
                        {up > 0 ? "▲" : "▼"}
                        {Math.abs(Math.round(up * 100))}%p
                      </em>
                    )}
                  </strong>
                </div>
                {t.lastUnderstanding && (
                  <div className="growth-row">
                    <span>스스로 이해도</span>
                    <strong>{UNDERSTANDING_LABELS[t.lastUnderstanding]}</strong>
                  </div>
                )}
                {t.signal && (
                  <div className="conversation-signal">
                    <Icon name="message" />
                    <span>
                      <strong>{SIGNAL[t.signal].label}</strong>
                      {viewer === "teacher" ? SIGNAL[t.signal].teacherHint : SIGNAL[t.signal].studentHint}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
