import type { ReportedQuestion } from "../types/domain";

export type StudentReportCount = { studentNumber: number; total: number; aiCleared: number };

/** 학생별 신고 수 (AI가 문제 없다고 본 신고 포함). 많은 순, 같으면 번호 순. 기록 비공개 학생은 익명 합계로만 */
export function reportCountsByStudent(rows: ReportedQuestion[]): { students: StudentReportCount[]; anonymous: number } {
  const by = new Map<number, StudentReportCount>();
  let anonymous = 0;
  for (const r of rows) {
    if (r.studentNumber === null) {
      anonymous += 1;
      continue;
    }
    const c = by.get(r.studentNumber) ?? { studentNumber: r.studentNumber, total: 0, aiCleared: 0 };
    c.total += 1;
    if (r.status === "AI_CLEARED") c.aiCleared += 1;
    by.set(r.studentNumber, c);
  }
  const students = [...by.values()].sort((a, b) => b.total - a.total || a.studentNumber - b.studentNumber);
  return { students, anonymous };
}
