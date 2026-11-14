import { describe, expect, it } from "vitest";
import { teacherNavLinks } from "./teacherNav";

const base = { homeroom: true, quizFeature: true };
const names = (i: Parameters<typeof teacherNavLinks>[0]) => teacherNavLinks(i).map((l) => l[2]);

describe("teacherNavLinks", () => {
  it("담임만: 반 대시보드·반 분석·신고된 문제", () => expect(names(base)).toEqual(["반 대시보드", "반 분석", "신고된 문제"]));
  it("담임: 배정이 있으면 메뉴 끝에 반·과목 항목이 붙는다", () =>
    expect(names({ ...base, assignments: [{ classId: "c2", subject: "국어" }] })).toEqual(["반 대시보드", "반 분석", "신고된 문제", "2학년 4반 국어"]));
  it("교과만: 대시보드 뒤에 반·과목 항목, 경로는 반·과목 화면", () => {
    const l = teacherNavLinks({ ...base, homeroom: false, assignments: [{ classId: "c1", subject: "수학" }, { classId: "c2", subject: "수학" }] });
    expect(l.map((x) => x[2])).toEqual(["대시보드", "2학년 3반 수학", "2학년 4반 수학"]);
    expect(l[1][0]).toBe("/teacher/subjects/c1/" + encodeURIComponent("수학"));
  });
  it("교과만 맡은 교사는 대시보드 하나", () => expect(names({ ...base, homeroom: false })).toEqual(["대시보드"]));
  it("교과만 맡은 교사의 대시보드는 /teacher로 간다", () =>
    expect(teacherNavLinks({ ...base, homeroom: false })[0][0]).toBe("/teacher"));
  it("교과 기능이 꺼져 있어도 담임 메뉴는 그대로", () =>
    expect(names(base)).toEqual(["반 대시보드", "반 분석", "신고된 문제"]));
  it("퀴즈 기능이 꺼져 있으면 신고된 문제를 숨긴다", () => expect(names({ ...base, quizFeature: false })).toEqual(["반 대시보드", "반 분석"]));
});
