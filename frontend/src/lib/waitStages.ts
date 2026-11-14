/** 테스트 첫 출제 대기 문구 (백엔드 실측 약 13초). 경과 시간(ms)에 따라 단계가 바뀐다 */
export function quizWaitText(elapsedMs: number): string {
  const t = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0;
  if (t < 3000) return "기록에서 주제를 확인하고 있어요 · 보통 10초쯤 걸려요";
  if (t < 9000) return "문항 5개를 만드는 중이에요";
  if (t < 20000) return "거의 다 됐어요";
  return "평소보다 오래 걸리고 있어요. 조금만 더 기다려 주세요";
}
