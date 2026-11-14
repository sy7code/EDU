import { describe, it, expect } from "vitest";
import { fewCell, subjectWeekSummary } from "./subjectSummary";
import type { SubjectSummaryInputs } from "../types/domain";

const WEEK = "2026-11-09";
const IN = "2026-11-10T01:00:00Z";
const empty: SubjectSummaryInputs = { sessions: [], sessionTopics: [], attempts: [], reflections: [], students: [], sessionOwners: [], items: [] };

/** 학생 n명이 각자 세션 하나(주제 T)를 주 안에 학습 */
function withStudents(n: number, over: Partial<SubjectSummaryInputs> = {}): SubjectSummaryInputs {
  const ids = Array.from({ length: n }, (_, k) => k + 1);
  return {
    ...empty,
    students: ids.map((k) => ({ studentId: `u${k}` })),
    sessions: ids.map((k) => ({ id: `s${k}`, subject: "수학", startedAt: IN })),
    sessionOwners: ids.map((k) => ({ sessionId: `s${k}`, studentId: `u${k}` })),
    sessionTopics: ids.map((k) => ({ sessionId: `s${k}`, topicId: "T", name: "이차함수" })),
    ...over,
  };
}
const run = (i: SubjectSummaryInputs) => subjectWeekSummary("c1", "수학", WEEK, i);

describe("fewCell", () => {
  it("1~2는 적음, 0과 3 이상은 숫자", () => {
    expect([0, 1, 2, 3, 10].map(fewCell)).toEqual([0, "적음", "적음", 3, 10]);
  });
});

describe("few / studentCount", () => {
  it("학습 학생 2명 이하면 few=true", () => {
    const r = run(withStudents(2));
    expect(r.few).toBe(true);
    expect(r.studentCount).toBe("적음");
  });
  it("few면 학습 수도 숨긴다", () => {
    expect(run(withStudents(2)).sessionCount).toBe(0);
    expect(run(withStudents(3)).sessionCount).toBe(3);
  });
  it("students에 없는 학생의 학습은 집계하지 않는다", () => {
    const base = withStudents(3);
    const r = run({
      ...base,
      sessions: [...base.sessions, { id: "sx", subject: "수학", startedAt: IN }, { id: "sy", subject: "수학", startedAt: IN }],
      sessionOwners: [...base.sessionOwners, { sessionId: "sx", studentId: "u9" }],
    });
    expect(r.sessionCount).toBe(3);
    expect(r.studentCount).toBe(3);
  });
  it("3명이면 숫자", () => {
    const r = run(withStudents(3));
    expect(r.few).toBe(false);
    expect(r.studentCount).toBe(3);
  });
});

describe("주 범위", () => {
  it("주 밖 학습은 빠진다", () => {
    const base = withStudents(3);
    const r = run({
      ...base,
      sessions: [
        ...base.sessions,
        { id: "sx1", subject: "수학", startedAt: "2026-11-08T14:59:00Z" }, // 일 23:59 서울 = 지난주
        { id: "sx2", subject: "수학", startedAt: "2026-11-15T15:00:00Z" }, // 다음 주 월 00:00
      ],
      sessionOwners: [...base.sessionOwners, { sessionId: "sx1", studentId: "u9" }, { sessionId: "sx2", studentId: "u9" }],
    });
    expect(r.sessionCount).toBe(3);
    expect(r.studentCount).toBe(3);
  });
  it("주 경계 안(일 23:59 서울, 월 00:00 서울)은 들어온다", () => {
    const base = withStudents(3);
    const r = run({
      ...base,
      sessions: [
        { id: "s1", subject: "수학", startedAt: "2026-11-08T15:00:00Z" }, // 월 00:00 서울
        { id: "s2", subject: "수학", startedAt: "2026-11-15T14:59:00Z" }, // 일 23:59 서울
        { id: "s3", subject: "수학", startedAt: IN },
      ],
    });
    expect(r.sessionCount).toBe(3);
  });
  it("학생 0명이면 few=false, 전부 0", () => {
    expect(run(empty)).toEqual({ classId: "c1", subject: "수학", weekStart: WEEK, few: false, sessionCount: 0, studentCount: 0, topics: [], hardQuestions: [] });
  });
});

describe("topics", () => {
  const att = (k: number, correct: number, total = 5, createdAt = "2026-11-10T02:00:00Z") => ({ sessionId: `s${k}`, topicId: "T", correct, total, createdAt });

  it("주제별 후보 수 1~2명은 적음, 0은 0", () => {
    // T: 5명 학습, u1·u2만 LOW_SCORE -> 후보 2 -> 적음. U: 3명 학습, 후보 0 -> 0
    const base = withStudents(5);
    const r = run({
      ...base,
      students: [...base.students, ...[6, 7, 8].map((k) => ({ studentId: `u${k}` }))],
      sessions: [...base.sessions, ...[6, 7, 8].map((k) => ({ id: `s${k}`, subject: "수학", startedAt: IN }))],
      sessionOwners: [...base.sessionOwners, ...[6, 7, 8].map((k) => ({ sessionId: `s${k}`, studentId: `u${k}` }))],
      sessionTopics: [...base.sessionTopics, ...[6, 7, 8].map((k) => ({ sessionId: `s${k}`, topicId: "U", name: "인수분해" }))],
      attempts: [att(1, 0), att(2, 1), att(3, 5), att(4, 5), att(5, 5), ...[6, 7, 8].map((k) => ({ sessionId: `s${k}`, topicId: "U", correct: 5, total: 5, createdAt: "2026-11-10T02:00:00Z" }))],
    });
    const t = Object.fromEntries(r.topics.map((x) => [x.topicId, x]));
    expect(t.T.reviewCount).toBe("적음");
    expect(t.T.studentCount).toBe(5);
    expect(t.U.reviewCount).toBe(0);
  });

  it("후보 3명 이상이면 숫자, reviewCount 큰 순 정렬", () => {
    const base = withStudents(3);
    const r = run({ ...base, attempts: [att(1, 0), att(2, 0), att(3, 0)] });
    expect(r.topics).toEqual([{ topicId: "T", name: "이차함수", studentCount: 3, reviewCount: 3, lastRate: 0 }]);
  });

  it("주제 없는 학습은 '주제 없음' 행으로 센다", () => {
    const base = withStudents(4);
    const r = run({ ...base, sessionTopics: base.sessionTopics.filter((t) => t.sessionId !== "s4") });
    const none = r.topics.find((x) => x.topicId === null);
    expect(none).toEqual({ topicId: null, name: "주제 없음", studentCount: "적음", reviewCount: 0, lastRate: null });
    expect(r.topics.find((x) => x.topicId === "T")?.studentCount).toBe(3);
    expect(r.studentCount).toBe(4);
  });

  it("lastRate는 응시 학생 3명 미만이면 null", () => {
    const r = run({ ...withStudents(3), attempts: [att(1, 5), att(2, 5)] });
    expect(r.topics[0].lastRate).toBeNull();
  });

  it("lastRate는 학생별 마지막 응시 정답률의 평균", () => {
    const r = run({
      ...withStudents(3),
      attempts: [att(1, 0, 5, "2026-11-10T01:00:00Z"), att(1, 5, 5, "2026-11-11T01:00:00Z"), att(2, 5), att(3, 0)],
    });
    expect(r.topics[0].lastRate).toBeCloseTo(2 / 3);
  });

  it("정렬: reviewCount 내림, studentCount 내림, 이름 오름 (가림 처리 전 숫자 기준)", () => {
    const base = withStudents(3);
    const mk = (id: string, name: string) => base.students.map((_, k) => ({ sessionId: `s${k + 1}`, topicId: id, name }));
    const r = run({
      ...base,
      sessionTopics: [...mk("B", "나"), ...mk("A", "가"), { sessionId: "s1", topicId: "C", name: "다" }],
      attempts: [{ sessionId: "s1", topicId: "C", correct: 0, total: 5, createdAt: "2026-11-10T02:00:00Z" }],
    });
    expect(r.topics.map((x) => x.topicId)).toEqual(["C", "A", "B"]);
  });

  it("학생 한 명의 후보가 4개 이상이어도 reviewCount에 모두 센다", () => {
    const base = withStudents(3);
    const ids = ["T1", "T2", "T3", "T4"];
    const r = run({
      ...base,
      sessionTopics: base.sessions.flatMap((s) => ids.map((t) => ({ sessionId: s.id, topicId: t, name: t }))),
      attempts: base.sessions.flatMap((s) => ids.map((t, n) => ({ sessionId: s.id, topicId: t, correct: 0, total: 5, createdAt: `2026-11-10T0${n + 1}:00:00Z` }))),
    });
    expect(r.topics.map((t) => t.reviewCount)).toEqual([3, 3, 3, 3]);
  });

  it("few면 topics·hardQuestions는 비운다", () => {
    const base = withStudents(2);
    const r = run({ ...base, items: [{ sessionId: "s1", questionId: "q", prompt: "p", correct: false, reported: false }], attempts: [att(1, 0)] });
    expect(r.few).toBe(true);
    expect(r.topics).toEqual([]);
    expect(r.hardQuestions).toEqual([]);
  });
});

describe("hardQuestions", () => {
  const it_ = (k: number, q: string, correct: boolean, reported = false) => ({ sessionId: `s${k}`, questionId: q, prompt: `문항 ${q}`, correct, reported });
  const all = (q: string, flags: boolean[]) => flags.map((c, k) => it_(k + 1, q, c));

  it("많이 틀린 문항은 신고 문항 제외, 응시 3명 이상, 정답률 낮은 순 2개", () => {
    const r = run({
      ...withStudents(4),
      items: [
        ...all("qa", [true, true, false, false]), // 0.5
        ...all("qb", [false, false, false, true]), // 0.25
        ...all("qc", [true, true, true, false]), // 0.75
        ...[1, 2].map((k) => it_(k, "qd", false)), // 응시 2명 -> 제외
        ...[1, 2, 3].map((k) => it_(k, "qe", false, true)), // 신고 -> 제외
      ],
    });
    expect(r.hardQuestions).toEqual([
      { questionId: "qb", prompt: "문항 qb", rate: 0.25, answered: 4 },
      { questionId: "qa", prompt: "문항 qa", rate: 0.5, answered: 4 },
    ]);
  });

  it("같은 학생이 한 문항을 여러 번 풀면 마지막 응답만 센다", () => {
    const r = run({ ...withStudents(3), items: [it_(1, "q", false), it_(1, "q", false), it_(1, "q", false), it_(2, "q", true), it_(3, "q", true)] });
    expect(r.hardQuestions).toEqual([{ questionId: "q", prompt: "문항 q", rate: 2 / 3, answered: 3 }]);
  });
  it("마지막 응답은 세션 시작 시각이 늦은 쪽이다", () => {
    const base = withStudents(3);
    const r = run({
      ...base,
      sessions: [{ id: "s1", subject: "수학", startedAt: "2026-11-12T01:00:00Z" }, { id: "s2", subject: "수학", startedAt: IN }, { id: "s3", subject: "수학", startedAt: IN }, { id: "s1old", subject: "수학", startedAt: "2026-11-10T00:00:00Z" }],
      sessionOwners: [...base.sessionOwners, { sessionId: "s1old", studentId: "u1" }],
      items: [{ sessionId: "s1", questionId: "q", prompt: "p", correct: true, reported: false }, { sessionId: "s1old", questionId: "q", prompt: "p", correct: false, reported: false }, it_(2, "q", false), it_(3, "q", false)],
    });
    expect(r.hardQuestions[0].rate).toBeCloseTo(1 / 3);
  });
  it("정답률이 같으면 questionId 오름차순", () => {
    const r = run({ ...withStudents(3), items: [...all("qz", [false, false, true]), ...all("qb", [false, false, true])] });
    expect(r.hardQuestions.map((q) => q.questionId)).toEqual(["qb", "qz"]);
  });

  it("주 밖 세션의 문항은 빠진다", () => {
    const base = withStudents(3);
    const r = run({
      ...base,
      sessions: [...base.sessions, { id: "old", subject: "수학", startedAt: "2026-11-01T00:00:00Z" }],
      sessionOwners: [...base.sessionOwners, { sessionId: "old", studentId: "u1" }],
      items: [...all("q1", [true, true, true]), { sessionId: "old", questionId: "q1", prompt: "x", correct: false, reported: false }],
    });
    expect(r.hardQuestions[0].rate).toBe(1);
  });
});
