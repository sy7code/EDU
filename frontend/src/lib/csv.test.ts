import { describe, expect, it } from "vitest";
import { buildStudentCsv, csvCell, studentCsvFileName } from "./csv";
import type { DashboardRow } from "../types/domain";

describe("csvCell", () => {
  it("쉼표·따옴표·줄바꿈이 있으면 따옴표로 감싸고 따옴표는 두 번 쓴다", () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("줄\n바꿈")).toBe('"줄\n바꿈"');
    expect(csvCell("plain")).toBe("plain");
  });
});

describe("csvCell 수식 주입 막기", () => {
  it("= + - @ 로 시작하는 글자는 앞에 '를 붙인다", () => {
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-2")).toBe("'-2");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell('=HYPERLINK("x",1)')).toBe(`"'=HYPERLINK(""x"",1)"`);
  });
  it("숫자 값은 그대로 둔다", () => {
    expect(csvCell(-3)).toBe("-3");
    expect(csvCell(12)).toBe("12");
  });
});

const row = (over: Partial<DashboardRow> = {}): DashboardRow => ({
  studentId: "s1",
  name: "김민수",
  number: 3,
  sessionCount: 4,
  totalMinutes: 95,
  openQuestionCount: 2,
  lastSessionAt: "2026-11-13T15:30:00.000Z", // 서울 11-14 00:30
  needsAttention: false,
  hasReflectionWithoutFeedback: true,
  shared: true,
  activeNow: true,
  pendingAssessment: 0,
  lastQuizRate: 0.375,
  ...over,
});

describe("buildStudentCsv", () => {
  it("BOM, 머리글, 학생 행을 CRLF로 잇는다", () => {
    expect(buildStudentCsv([row()])).toBe(
      "\uFEFF번호,이름,학습 횟수,학습 시간(분),남은 질문,최근 테스트(%),최근 학습,상태\r\n" +
        "3,김민수,4,95,2,38,2026-11-14 00:30,학습 중 · 피드백 기다림\r\n",
    );
  });
});

describe("buildStudentCsv 기록 비공개", () => {
  it("기록 공유를 안 한 학생은 남은 질문·최근 테스트를 비우고 상태를 '기록 비공개'로 쓴다", () => {
    const csv = buildStudentCsv([row({ shared: false, hasReflectionWithoutFeedback: false, lastQuizRate: null, openQuestionCount: 5 })]);
    expect(csv.split("\r\n")[1]).toBe("3,김민수,4,95,,,2026-11-14 00:30,기록 비공개");
  });
  it("기록이 없으면 최근 학습·테스트 칸을 비운다", () => {
    const csv = buildStudentCsv([row({ lastSessionAt: null, lastQuizRate: null, activeNow: false, hasReflectionWithoutFeedback: false, needsAttention: true, sessionCount: 0 })]);
    expect(csv.split("\r\n")[1]).toBe("3,김민수,0,95,2,,,최근 기록 없음");
  });
});

describe("studentCsvFileName", () => {
  it("서울 날짜로 이름을 짓는다 (UTC로는 전날이어도)", () => {
    expect(studentCsvFileName(new Date("2026-11-13T15:30:00Z"))).toBe("학습현황_2026-11-14.csv");
    expect(studentCsvFileName(new Date("2026-01-05T14:59:00Z"))).toBe("학습현황_2026-01-05.csv");
  });
});
