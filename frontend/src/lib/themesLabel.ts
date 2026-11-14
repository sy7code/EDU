const KST = 9 * 3600000;

/** 질문 핵심 요약 머리 문구. 시각은 서울 기준, 없으면 생략 */
export function themesHeaderLabel(generatedAt: string | null): string {
  const base = "AI 요약 · 참고용";
  const t = generatedAt ? Date.parse(generatedAt) : NaN;
  if (Number.isNaN(t)) return base;
  const d = new Date(t + KST);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${base} · ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${hh}:${mm} 만듦`;
}
