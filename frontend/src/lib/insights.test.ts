import { describe, expect, it } from "vitest";
import { studentInsights, type InsightInput } from "./insights";
import type { TopicGrowth } from "../types/domain";

const base: InsightInput = { period: "최근 4주", shared: true, sessionCount: 5, classAvgSessions: 5 };
const topic = (over: Partial<TopicGrowth>): TopicGrowth => ({
  topicId: "t",
  name: "이차함수",
  sessions: 2,
  minutes: 60,
  attempts: 2,
  firstRate: 0.6,
  lastRate: 0.6,
  lastTotal: 5,
  lastUnderstanding: 2,
  signal: null,
  ...over,
});
const texts = (i: InsightInput) => studentInsights(i).map((x) => x.text);

describe("교사 판단 문장", () => {
  it("기간 안 학습이 없으면 경고와 마지막 학습 근거", () => {
    const [first] = studentInsights({ ...base, sessionCount: 0, lastSessionAt: null });
    expect(first).toMatchObject({ tone: "warn", text: "최근 4주 학습 기록 없음" });
    expect(first.action).not.toBe("");
  });

  it("학습 횟수가 반 평균의 절반 미만이면 숫자 근거와 함께 경고", () => {
    const [first] = studentInsights({ ...base, sessionCount: 2, classAvgSessions: 5.2 });
    expect(first).toMatchObject({ tone: "warn", text: "학습 횟수가 반 평균의 절반 아래", evidence: "2회 / 반 평균 5.2회" });
    expect(texts({ ...base, sessionCount: 3, classAvgSessions: 5.2 })).not.toContain("학습 횟수가 반 평균의 절반 아래");
  });

  it("주제 신호: 이해했다는데 점수 낮음, 점수 낮음", () => {
    const out = studentInsights({ ...base, topics: [topic({ name: "꼭짓점", signal: "OVERCONFIDENT", lastRate: 0.4 }), topic({ name: "부등식", signal: "LOW_SCORE", lastRate: 0.2 })] });
    expect(out[0]).toMatchObject({ tone: "warn", text: "꼭짓점: 이해했다는데 점수가 낮음", evidence: "최근 정답률 40% · 이해도 '친구에게 설명할 수 있어요'" });
    expect(out[1]).toMatchObject({ tone: "warn", text: "부등식: 정답률 낮음", evidence: "최근 정답률 20%" });
  });

  it("정답률이 20%p 이상 오른 주제는 좋은 점으로", () => {
    const out = studentInsights({ ...base, topics: [topic({ name: "확률", firstRate: 0.4, lastRate: 0.8 }), topic({ name: "통계", firstRate: 0.6, lastRate: 0.7 })] });
    expect(out).toEqual([expect.objectContaining({ tone: "good", text: "확률: 정답률이 올랐음", evidence: "40% → 80%" })]);
  });

  it("AI 질문 중 답 요청이 절반 이상(질문 4개 이상)이면 경고, 3개 이하면 판단하지 않음", () => {
    const [first] = studentInsights({ ...base, types: { CONCEPT: 1, CHECK: 0, ANSWER: 3, OTHER: 0 } });
    expect(first).toMatchObject({ tone: "warn", text: "AI에 답을 바로 묻는 편", evidence: "질문 4개 중 답 요청 3개 (75%)" });
    expect(texts({ ...base, types: { CONCEPT: 0, CHECK: 0, ANSWER: 3, OTHER: 0 } })).toEqual(["특별히 챙길 신호 없음"]);
  });

  it("확인 테스트 정답률이 40% 미만이면 경고 (반 평균이 있으면 근거에)", () => {
    const [first] = studentInsights({ ...base, quizRate: 0.35, classAvgQuizRate: 0.7 });
    expect(first).toMatchObject({ tone: "warn", text: "확인 테스트 정답률 낮음", evidence: "35% / 반 평균 70%" });
  });

  it("남은 질문 3개 이상, 피드백 기다림", () => {
    expect(texts({ ...base, openQuestionCount: 3, hasReflectionWithoutFeedback: true })).toEqual(["남은 질문이 쌓임", "피드백 기다리는 돌아보기 있음"]);
  });

  it("기록 공유 미동의면 횟수만으로 판단하고 내용 기반 문장은 만들지 않는다", () => {
    const out = texts({ ...base, shared: false, quizRate: 0.1, topics: [topic({ signal: "LOW_SCORE" })], types: { CONCEPT: 0, CHECK: 0, ANSWER: 5, OTHER: 0 } });
    expect(out).toEqual(["기록 공유 미동의 — 횟수·시간으로만 판단"]);
  });

  it("경고 → 좋은 점 → 안내 순, 최대 4개", () => {
    const out = studentInsights({
      ...base,
      sessionCount: 1,
      quizRate: 0.2,
      openQuestionCount: 5,
      hasReflectionWithoutFeedback: true,
      types: { CONCEPT: 0, CHECK: 0, ANSWER: 4, OTHER: 0 },
      topics: [topic({ name: "a", signal: "LOW_SCORE", lastRate: 0.2 }), topic({ name: "b", firstRate: 0.2, lastRate: 0.6 })],
    });
    expect(out).toHaveLength(4);
    expect(out.every((x) => x.tone === "warn")).toBe(true);
    const tones = studentInsights({ ...base, hasReflectionWithoutFeedback: true, topics: [topic({ name: "b", firstRate: 0.2, lastRate: 0.6 })], openQuestionCount: 4 }).map((x) => x.tone);
    expect(tones).toEqual(["warn", "good", "info"]);
  });
});
