import { describe, expect, it } from "vitest";
import type { TeacherAssignment, User } from "../types/domain";
import { activeAssignments, canSubjectTeacherSee, isHomeroomTeacher, subjectShareActive } from "./subjectAccess";

const now = new Date("2026-11-14T12:00+09:00");
const asg: TeacherAssignment = { teacherId: "t3", classId: "c1", subject: "수학", term: "2026-2" };
const both = { learningRecord: true, subjectShare: true };
const base = { assignments: [asg], teacherId: "t3", studentClassId: "c1", sessionSubject: "수학", consents: both, now };

describe("isHomeroomTeacher", () => {
  const teacher = (classId: string): User => ({ id: "t", name: "t", role: "teacher", classId });
  it("담임 교사는 자기 반에서 true", () => expect(isHomeroomTeacher(teacher("c1"), "c1")).toBe(true));
  it("classId 빈 교과 교사는 false", () => expect(isHomeroomTeacher(teacher(""), "c1")).toBe(false));
  it("다른 반 담임은 false", () => expect(isHomeroomTeacher(teacher("c2"), "c1")).toBe(false));
  it("학생은 false", () =>
    expect(isHomeroomTeacher({ id: "s", name: "s", role: "student", classId: "c1" }, "c1")).toBe(false));
});

describe("activeAssignments", () => {
  it("교사와 현재 학기로 거른다", () => {
    const all: TeacherAssignment[] = [
      asg,
      { ...asg, term: "2026-1" },
      { ...asg, teacherId: "t4" },
      { ...asg, classId: "c2", subject: "국어" },
    ];
    expect(activeAssignments(all, "t3", now)).toEqual([asg, all[3]]);
  });
});

describe("subjectShareActive", () => {
  it("둘 다 true일 때만 true", () => {
    expect(subjectShareActive(both)).toBe(true);
    expect(subjectShareActive({ learningRecord: true, subjectShare: false })).toBe(false);
    expect(subjectShareActive({ learningRecord: false, subjectShare: true })).toBe(false);
    expect(subjectShareActive({ learningRecord: false, subjectShare: false })).toBe(false);
  });
});

describe("canSubjectTeacherSee", () => {
  it("같은 반·수학·둘 다 동의 → true", () => expect(canSubjectTeacherSee(base)).toBe(true));
  it("다른 과목 국어 → false", () => expect(canSubjectTeacherSee({ ...base, sessionSubject: "국어" })).toBe(false));
  it("다른 반 c2 → false", () => expect(canSubjectTeacherSee({ ...base, studentClassId: "c2" })).toBe(false));
  it("기타 → false", () => {
    expect(canSubjectTeacherSee({ ...base, sessionSubject: "기타" })).toBe(false);
    const etc = { ...asg, subject: "기타" };
    expect(canSubjectTeacherSee({ ...base, assignments: [etc], sessionSubject: "기타" })).toBe(false);
  });
  it("subjectShare false → false", () =>
    expect(canSubjectTeacherSee({ ...base, consents: { learningRecord: true, subjectShare: false } })).toBe(false));
  it("learningRecord false, subjectShare true → false", () =>
    expect(canSubjectTeacherSee({ ...base, consents: { learningRecord: false, subjectShare: true } })).toBe(false));
  it("배정 term 2026-1 → false", () =>
    expect(canSubjectTeacherSee({ ...base, assignments: [{ ...asg, term: "2026-1" }] })).toBe(false));
  it("배정 없음 → false", () => expect(canSubjectTeacherSee({ ...base, assignments: [] })).toBe(false));
  it("다른 교사 배정 → false", () =>
    expect(canSubjectTeacherSee({ ...base, assignments: [{ ...asg, teacherId: "t4" }] })).toBe(false));
});
