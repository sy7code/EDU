import { describe, expect, it } from "vitest";
import { navItemActive, teacherNavLinks } from "./teacherNav";

const base = { homeroom: true, quizFeature: true };
const names = (i: Parameters<typeof teacherNavLinks>[0]) => teacherNavLinks(i).map((l) => l[2]);

describe("teacherNavLinks", () => {
  it("담임만: 반 대시보드·반 분석·신고된 문제", () => expect(names(base)).toEqual(["반 대시보드", "반 분석", "신고된 문제"]));
  it("담임: 배정이 있으면 메뉴 끝에 '맡은 과목' 하나가 붙는다", () =>
    expect(names({ ...base, assignments: [{ classId: "c2", subject: "국어" }] })).toEqual(["반 대시보드", "반 분석", "신고된 문제", "맡은 과목"]));
  it("교과만: 배정이 여러 개여도 '맡은 과목' 항목은 하나, 경로는 /teacher/subject", () => {
    const l = teacherNavLinks({ ...base, homeroom: false, assignments: [{ classId: "c1", subject: "수학" }, { classId: "c2", subject: "수학" }, { classId: "c1", subject: "국어" }] });
    expect(l.map((x) => x[2])).toEqual(["대시보드", "맡은 과목"]);
    expect(l[1][0]).toBe("/teacher/subject");
  });
  it("배정이 빈 배열이면 '맡은 과목'을 숨긴다", () => expect(names({ ...base, homeroom: false, assignments: [] })).toEqual(["대시보드"]));
  it("'맡은 과목'은 과목 화면과 학생 화면에서 켜진다", () => {
    const to = "/teacher/subject";
    expect(navItemActive(to, "/teacher/subject")).toBe(true);
    expect(navItemActive(to, "/teacher/subjects/c1/" + encodeURIComponent("수학") + "/students/s1")).toBe(true);
    expect(navItemActive(to, "/teacher")).toBe(false);
    expect(navItemActive(to, "/teacher/analytics")).toBe(false);
  });
  it("일반 항목은 정확히 같은 경로만 켜진다", () => {
    expect(navItemActive("/teacher", "/teacher")).toBe(true);
    expect(navItemActive("/teacher", "/teacher/subject")).toBe(false);
    expect(navItemActive("/teacher", "/teacher/analytics")).toBe(false);
  });
  it("교과만 맡은 교사는 대시보드 하나", () => expect(names({ ...base, homeroom: false })).toEqual(["대시보드"]));
  it("교과만 맡은 교사의 대시보드는 /teacher로 간다", () =>
    expect(teacherNavLinks({ ...base, homeroom: false })[0][0]).toBe("/teacher"));
  it("교과 기능이 꺼져 있어도 담임 메뉴는 그대로", () =>
    expect(names(base)).toEqual(["반 대시보드", "반 분석", "신고된 문제"]));
  it("퀴즈 기능이 꺼져 있으면 신고된 문제를 숨긴다", () => expect(names({ ...base, quizFeature: false })).toEqual(["반 대시보드", "반 분석"]));
});
