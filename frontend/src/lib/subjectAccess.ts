import type { TeacherAssignment, User } from "../types/domain";
import { currentTerm } from "./schoolCalendar";

/** 담임 = 교사이면서 classId가 비어 있지 않고 학생 반과 같음. 교과만 맡은 교사는 classId "" */
export function isHomeroomTeacher(t: User, studentClassId: string): boolean {
  return t.role === "teacher" && t.classId !== "" && t.classId === studentClassId;
}

/** 그 교사의 현재 학기 배정만 */
export function activeAssignments(all: TeacherAssignment[], teacherId: string, now: Date): TeacherAssignment[] {
  const term = currentTerm(now);
  return all.filter((a) => a.teacherId === teacherId && a.term === term);
}

/** 교과 교사 공유는 학습 기록 동의와 교과 공유 동의가 둘 다 있어야 켜진다 */
export function subjectShareActive(c: { learningRecord: boolean; subjectShare: boolean }): boolean {
  return c.learningRecord && c.subjectShare;
}

/** 교과 교사 열람 가능: 현재 학기 배정(반·과목 일치) AND 두 동의. "기타"는 항상 false */
export function canSubjectTeacherSee(i: {
  assignments: TeacherAssignment[];
  teacherId: string;
  studentClassId: string;
  sessionSubject: string;
  consents: { learningRecord: boolean; subjectShare: boolean };
  now: Date;
}): boolean {
  if (i.sessionSubject === "기타") return false;
  if (!subjectShareActive(i.consents)) return false;
  return activeAssignments(i.assignments, i.teacherId, i.now).some(
    (a) => a.classId === i.studentClassId && a.subject === i.sessionSubject,
  );
}
