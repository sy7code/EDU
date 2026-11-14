import type { DashboardRow } from "../types/domain";

/**
 * CSV 칸 하나.
 * - 글자 값이 = + - @ (또는 탭·CR)로 시작하면 엑셀이 수식으로 읽지 않게 앞에 '를 붙인다 (CSV 수식 주입 방지)
 * - 쉼표·따옴표·줄바꿈이 있으면 따옴표로 감싼다 (RFC 4180)
 */
export function csvCell(value: string | number | null | undefined): string {
  let s = String(value ?? "");
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 엑셀이 UTF-8로 읽게 하는 BOM */
const BOM = String.fromCharCode(0xfeff);

const HEADER = ["번호", "이름", "학습 횟수", "학습 시간(분)", "남은 질문", "최근 테스트(%)", "최근 학습", "상태"];

const seoulParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function seoul(d: Date): Record<string, string> {
  return Object.fromEntries(seoulParts.formatToParts(d).map((x) => [x.type, x.value]));
}

/** 서울 시각 "YYYY-MM-DD HH:mm" */
function seoulStamp(iso: string): string {
  const p = seoul(new Date(iso));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** 표의 상태 배지와 같은 문구 */
function statusText(r: DashboardRow): string {
  const parts: string[] = [];
  if (r.activeNow) parts.push("학습 중");
  if (r.needsAttention) parts.push(r.sessionCount === 0 ? "최근 기록 없음" : "질문이 쌓임");
  if (r.hasReflectionWithoutFeedback) parts.push("피드백 기다림");
  if (r.pendingAssessment > 0) parts.push(`확정 ${r.pendingAssessment}`);
  return parts.join(" · ");
}

/** 최근 테스트(%) 열 위치 */
const QUIZ_COL = HEADER.indexOf("최근 테스트(%)");

/**
 * 대시보드 표를 CSV로 (엑셀이 한글을 읽도록 UTF-8 BOM, 줄 끝 CRLF)
 * quizRate: false면 최근 테스트 열을 뺀다 (표에서 FEATURES.dashboardQuizRate로 숨길 때 맞춤)
 */
export function buildStudentCsv(rows: DashboardRow[], opts: { quizRate?: boolean } = {}): string {
  const keep = (_: unknown, i: number) => opts.quizRate !== false || i !== QUIZ_COL;
  const body = rows.map((r) => [
    r.number,
    r.name,
    r.sessionCount,
    r.totalMinutes,
    r.shared ? r.openQuestionCount : "",
    !r.shared || r.lastQuizRate === null ? "" : Math.round(r.lastQuizRate * 100),
    r.lastSessionAt ? seoulStamp(r.lastSessionAt) : "",
    r.shared ? statusText(r) : "기록 비공개",
  ]);
  return BOM + [HEADER, ...body].map((cells) => cells.filter(keep).map(csvCell).join(",") + "\r\n").join("");
}

/** 내려받을 파일 이름: 학습현황_YYYY-MM-DD.csv (서울 날짜) */
export function studentCsvFileName(now: Date): string {
  const p = seoul(now);
  return `학습현황_${p.year}-${p.month}-${p.day}.csv`;
}
