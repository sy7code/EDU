import { useQuery } from "@tanstack/react-query";
import { api } from "../../api";
import { Badge, Card, ErrorState, Spinner } from "../../components/ui";
import { UNDERSTANDING_LABELS } from "../../lib/checklists";
import { formatDuration } from "../../lib/time";
import type { UnitOverview } from "../../types/domain";

const SIGNAL: Record<NonNullable<UnitOverview["signal"]>, { label: string; hint: string }> = {
  OVERCONFIDENT: { label: "이해했다는데 점수 낮음", hint: "스스로 '설명할 수 있다'고 했지만 정답률이 60% 미만이에요. 오개념이 있는지 이야기해 보세요." },
  LOW_SCORE: { label: "정답률 낮음", hint: "정답률이 40% 미만이에요. 이 단원을 다시 함께 살펴보면 좋아요." },
};

const pct = (r: number | null) => (r === null ? "-" : `${Math.round(r * 100)}%`);

/** 학생 종합 보드: 학습 시간·기록·테스트·이해도를 단원별로 한눈에. 점수 매기기가 아니라 대화 출발점. */
export function StudentOverviewBoard({ studentId }: { studentId: string }) {
  const o = useQuery({ queryKey: ["overview", studentId], queryFn: () => api.getStudentOverview(studentId) });
  if (o.isLoading) return <Spinner />;
  if (o.error) return <ErrorState error={o.error} onRetry={() => o.refetch()} />;
  const data = o.data!;
  const studied = data.units.filter((u) => u.sessions > 0);
  const untouched = data.units.filter((u) => u.sessions === 0);
  const signals = studied.filter((u) => u.signal);

  return (
    <Card className="mb-5 p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 px-5 py-3">
        <h2 className="font-semibold">종합 보드</h2>
        <span className="text-xs text-stone-500">단원별 학습 시간·기록·테스트·스스로 매긴 이해도 · 테스트는 성적에 들어가지 않아요</span>
      </div>
      {!data.shared && (
        <p className="border-b border-amber-200 bg-amber-50 px-5 py-2 text-sm text-amber-800">
          이 학생은 기록 공유에 동의하지 않아 학습 횟수·시간만 보여요.
        </p>
      )}
      {signals.length > 0 && (
        <ul className="space-y-1 border-b border-stone-200 px-5 py-3 text-sm">
          {signals.map((u) => (
            <li key={u.unitId}>
              <Badge tone="amber">{SIGNAL[u.signal!].label}</Badge> <strong>{u.title}</strong> — {SIGNAL[u.signal!].hint}
            </li>
          ))}
        </ul>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-stone-50 text-left text-xs text-stone-500">
            <tr>
              <th className="px-5 py-2">단원</th>
              <th className="px-3 py-2">학습</th>
              <th className="px-3 py-2">시간</th>
              <th className="px-3 py-2">기록(질문)</th>
              <th className="px-3 py-2">최근 테스트</th>
              <th className="px-3 py-2">스스로 이해도</th>
            </tr>
          </thead>
          <tbody>
            {studied.map((u) => (
              <tr key={u.unitId} className={`border-t border-stone-100 ${u.signal ? "bg-amber-50/50" : ""}`}>
                <td className="px-5 py-2">
                  <span className="text-xs text-stone-400">{u.subject}</span> {u.title}
                </td>
                <td className="px-3 py-2 tabular-nums">{u.sessions}회</td>
                <td className="px-3 py-2 tabular-nums">{formatDuration(u.minutes)}</td>
                <td className="px-3 py-2 tabular-nums">{u.entries === null ? "-" : `${u.entries}(${u.questions})`}</td>
                <td className="px-3 py-2 tabular-nums">
                  {pct(u.lastQuizRate)}
                </td>
                <td className="px-3 py-2 text-xs">{u.lastUnderstanding ? UNDERSTANDING_LABELS[u.lastUnderstanding] : "-"}</td>
              </tr>
            ))}
            {data.noUnit.sessions > 0 && (
              <tr className="border-t border-stone-100 text-stone-500">
                <td className="px-5 py-2">단원 없이 한 학습</td>
                <td className="px-3 py-2 tabular-nums">{data.noUnit.sessions}회</td>
                <td className="px-3 py-2 tabular-nums">{formatDuration(data.noUnit.minutes)}</td>
                <td className="px-3 py-2" colSpan={3} />
              </tr>
            )}
            {studied.length === 0 && data.noUnit.sessions === 0 && (
              <tr>
                <td className="px-5 py-4 text-stone-400" colSpan={6}>아직 학습 기록이 없어요</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {untouched.length > 0 && (
        <p className="border-t border-stone-100 px-5 py-2 text-xs text-stone-500">
          아직 학습하지 않은 단원: {untouched.map((u) => `${u.subject} ${u.title}`).join(", ")}
        </p>
      )}
    </Card>
  );
}
