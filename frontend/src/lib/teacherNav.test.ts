import { describe, expect, it } from "vitest";
import { teacherNavLinks } from "./teacherNav";

const base = { homeroom: true, hasAssignments: false, subjectFeature: true, quizFeature: true };
const names = (i: Parameters<typeof teacherNavLinks>[0]) => teacherNavLinks(i).map((l) => l[2]);

describe("teacherNavLinks", () => {
  it("담임만: 반 대시보드·반 분석·신고된 문제", () => expect(names(base)).toEqual(["반 대시보드", "반 분석", "신고된 문제"]));
  it("담임이면서 배정이 있으면 내 과목이 더 붙는다", () =>
    expect(names({ ...base, hasAssignments: true })).toEqual(["반 대시보드", "반 분석", "신고된 문제", "내 과목"]));
  it("교과만 맡은 교사는 내 과목만", () => expect(names({ ...base, homeroom: false, hasAssignments: true })).toEqual(["내 과목"]));
  it("교과 기능이 꺼져 있으면 내 과목을 숨긴다", () =>
    expect(names({ ...base, hasAssignments: true, subjectFeature: false })).toEqual(["반 대시보드", "반 분석", "신고된 문제"]));
  it("퀴즈 기능이 꺼져 있으면 신고된 문제를 숨긴다", () => expect(names({ ...base, quizFeature: false })).toEqual(["반 대시보드", "반 분석"]));
});
