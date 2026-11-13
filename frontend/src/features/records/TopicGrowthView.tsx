import { useQuery } from "@tanstack/react-query";
import { api } from "../../api";
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
      <Card className="mb-5 border-amber-200 bg-amber-50 text-sm text-amber-800">
        이 학생은 기록 공유에 동의하지 않아 주제별 성장은 보이지 않아요. 전체 {total.sessions}회 · {formatDuration(total.minutes)} 학습했어요.
      </Card>
    );
  }

  return (
    <Card className="mb-5 p-0">
      <div className="flex flex-wrap items-baseline gap-2 border-b border-stone-200 px-5 py-3">
        <h2 className="font-semibold">{viewer === "student" ? "내 성장" : "주제별 성장"}</h2>
        <span className="text-xs text-stone-500">
          AI가 기록에서 찾은 주제별 · 확인 테스트는 모두에게 같은 난이도 · 성적에 들어가지 않아요
        </span>
      </div>
      {topics.length === 0 ? (
        <p className="px-5 py-4 text-sm text-stone-400">아직 주제가 없어요. 학습을 마치면 AI가 기록에서 주제를 찾아요.</p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {topics.map((t) => {
            const up = t.firstRate !== null && t.lastRate !== null && t.attempts > 1 ? t.lastRate - t.firstRate : null;
            return (
              <li key={t.topicId} className={`px-5 py-3 ${t.signal ? "bg-amber-50/50" : ""}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{t.name}</span>
                  {t.subject && <span className="text-xs text-stone-400">{t.subject}</span>}
                  {t.signal && <Badge tone="amber">{SIGNAL[t.signal].label}</Badge>}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-600">
                  <span>{t.sessions}회 · {formatDuration(t.minutes)}</span>
                  <span>
                    확인 테스트 {t.attempts}번 · {t.attempts > 1 ? `${pct(t.firstRate)} → ${pct(t.lastRate)}` : pct(t.lastRate)}
                    {t.lastTotal !== null && t.lastTotal < 5 && <span className="ml-1 text-xs text-stone-400">(최근 {t.lastTotal}문항 기준)</span>}
                    {up !== null && up !== 0 && (
                      <strong className={up > 0 ? "ml-1 text-brand-700" : "ml-1 text-amber-700"}>
                        {up > 0 ? "▲" : "▼"}
                        {Math.abs(Math.round(up * 100))}%p
                      </strong>
                    )}
                  </span>
                  {t.lastUnderstanding && <span className="text-xs">스스로: {UNDERSTANDING_LABELS[t.lastUnderstanding]}</span>}
                </div>
                {t.signal && (
                  <p className="mt-1 text-xs text-amber-800">{viewer === "teacher" ? SIGNAL[t.signal].teacherHint : SIGNAL[t.signal].studentHint}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
