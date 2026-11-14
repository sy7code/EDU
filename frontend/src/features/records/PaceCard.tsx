import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api";
import { ErrorState, Spinner } from "../../components/ui";
import { PACE_MAX, PACE_PART_LABELS, paceFeedback, paceTrend, weekSeries, type PaceDay, type PaceParts } from "../../lib/pace";

const NOTE = "Pace 지수는 내 평소 기록과 비교한 참고 점수예요. 성적에 들어가지 않아요. '나만 보기' 기록은 점수에 들어가지 않아요.";

/** 학생 홈·교사 학생 상세가 함께 쓰는 Pace 지수 카드. shared=false면 내용을 불러오지 않는다 */
export function PaceCard({ studentId, title, shared = true }: { studentId: string | undefined; title: string; shared?: boolean }) {
  const q = useQuery({
    queryKey: ["pace", studentId],
    queryFn: () => api.getPaceInputs(studentId!),
    enabled: !!studentId && shared,
  });
  return (
    <section className="card pace-card" aria-label={title}>
      <div className="pace-head">
        <div>
          <h2>{title}</h2>
          <p>이번 주 월~금 Pace 지수 (하루 100점)</p>
        </div>
        {shared && q.data?.shared && <TrendChip series={weekSeries(q.data)} />}
      </div>
      {!shared || q.data?.shared === false ? (
        <p className="pace-empty">기록 공유에 동의하지 않아 Pace 지수는 보이지 않아요.</p>
      ) : q.isLoading ? (
        <Spinner label="Pace 지수를 계산하는 중" />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data ? (
        <PaceBody series={weekSeries(q.data)} />
      ) : null}
      <p className="pace-note">{NOTE}</p>
    </section>
  );
}

function TrendChip({ series }: { series: PaceDay[] }) {
  const t = paceTrend(series);
  if (!t) return null;
  return <span className={`pace-trend pace-trend-${t.tone}`}>{t.label}</span>;
}

function PaceBody({ series }: { series: PaceDay[] }) {
  const latest = [...series].reverse().find((d) => d.pace);
  const [chosen, setChosen] = useState<string | null>(null);
  const selected = series.find((d) => d.date === chosen) ?? latest ?? null;
  return (
    <>
      <PaceChart series={series} selectedDate={selected?.date ?? null} />
      <div className="pace-days" role="group" aria-label="요일 고르기">
        {series.map((d) => (
          <button
            key={d.date}
            type="button"
            className="pace-day"
            aria-pressed={selected?.date === d.date}
            onClick={() => setChosen(d.date)}
          >
            {d.label}
            <small>{d.pace ? `${d.pace.total}점` : "-"}</small>
          </button>
        ))}
      </div>
      {selected && (selected.pace ? <PartBars parts={selected.pace.parts} label={selected.label} /> : <p className="pace-empty">{selected.label}요일에는 학습 기록이 없어요.</p>)}
      <p className="pace-feedback">{paceFeedback(series, selected?.pace ?? null)}</p>
    </>
  );
}

function PartBars({ parts, label }: { parts: PaceParts; label: string }) {
  const keys = Object.keys(PACE_MAX) as Array<keyof PaceParts>;
  return (
    <ul className="pace-parts" aria-label={`${label}요일 항목별 점수`}>
      {keys.map((k) => (
        <li key={k} className="pace-part">
          <span className="pace-part-label">{PACE_PART_LABELS[k]}</span>
          <span className="pace-part-track" aria-hidden="true">
            <span className="pace-part-fill" style={{ width: `${(parts[k] / PACE_MAX[k]) * 100}%` }} />
          </span>
          <span className="pace-part-value">
            {parts[k]} / {PACE_MAX[k]}
          </span>
        </li>
      ))}
    </ul>
  );
}

const W = 320;
const H = 170;
const PAD = { left: 30, right: 14, top: 18, bottom: 26 };

function PaceChart({ series, selectedDate }: { series: PaceDay[]; selectedDate: string | null }) {
  const x = (i: number) => PAD.left + (i * (W - PAD.left - PAD.right)) / Math.max(1, series.length - 1);
  const y = (v: number) => PAD.top + ((100 - v) * (H - PAD.top - PAD.bottom)) / 100;
  const points = series.map((d, i) => (d.pace ? { i, d, v: d.pace.total } : null)).filter((p) => p !== null);
  const lastIndex = points.length ? points[points.length - 1].i : -1;
  const path = points.map((p, n) => `${n === 0 ? "M" : "L"}${x(p.i)},${y(p.v)}`).join(" ");
  const summary = series.map((d) => `${d.label} ${d.pace ? `${d.pace.total}점` : "기록 없음"}`).join(", ");
  return (
    <svg className="pace-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`이번 주 Pace 지수: ${summary}`}>
      {[0, 25, 50, 75, 100].map((v) => (
        <g key={v}>
          <line className="pace-grid" x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} />
          <text className="pace-axis" x={PAD.left - 6} y={y(v) + 3} textAnchor="end">
            {v}
          </text>
        </g>
      ))}
      {series.map((d, i) => (
        <text key={d.date} className={`pace-axis${d.date === selectedDate ? " pace-axis-on" : ""}`} x={x(i)} y={H - 8} textAnchor="middle">
          {d.label}
        </text>
      ))}
      {path && <path className="pace-line" d={path} />}
      {points.map((p) => (
        <g key={p.d.date}>
          <circle className={p.i === lastIndex ? "pace-dot pace-dot-last" : "pace-dot"} cx={x(p.i)} cy={y(p.v)} r={p.i === lastIndex ? 5.5 : 4} />
          <text className="pace-value" x={x(p.i)} y={y(p.v) - 9} textAnchor="middle">
            {p.v}
          </text>
        </g>
      ))}
    </svg>
  );
}
