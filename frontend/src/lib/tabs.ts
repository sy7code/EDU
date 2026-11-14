/** URL 값을 허용된 탭 이름으로. 없거나 모르는 값이면 기본 탭 */
export function parseTab<T extends string>(v: string | null, allowed: readonly T[], fallback: T): T {
  return v !== null && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

/** 교사 학생 상세 탭: ?tab 이 없고 ?session 만 있는 예전 링크는 학습 기록, 그 밖의 잘못된 값은 요약 */
export function studentDetailTab(tab: string | null, session: string | null): "summary" | "records" | "questions" {
  if (tab === null) return session ? "records" : "summary";
  return parseTab(tab, ["summary", "records", "questions"] as const, "summary");
}

/** 학생 내 기록 탭: notes 만 '내 정리', 그 밖은 학습 목록 */
export function myRecordsTab(tab: string | null): "list" | "notes" {
  return parseTab(tab, ["list", "notes"] as const, "list");
}

/** 학습 중 화면 기록 종류: ?kind=PAPER (휴대폰 QR) 등 알려진 값만, 그 밖은 메모 */
export function composerKind(v: string | null): "MEMO" | "QUESTION" | "QUIZ" | "PAPER" {
  return parseTab(v, ["MEMO", "QUESTION", "QUIZ", "PAPER"] as const, "MEMO");
}
