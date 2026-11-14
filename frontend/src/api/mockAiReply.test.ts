import { describe, expect, it } from "vitest";
import { mockAiReply } from "./mockAiReply";

const questionMarks = (s: string) => (s.match(/[?？]/g) ?? []).length;
const MARKDOWN = /[*#`]|^\s*[-•]\s|\d\.\s/m;

describe("mock AI 도우미 답변 (서버 프롬프트와 같은 방향)", () => {
  it("개념 질문은 사전의 개념 설명으로 바로 답한다", () => {
    const r = mockAiReply("부등식에서 음수를 곱하면 왜 방향이 바뀌어?");
    expect(r).toContain("음수를 곱하거나 나누면 방향이 반대가 돼요");
  });

  it("'그냥 알려줘'에도 개념은 설명하고, 최종 계산은 학생에게 맡긴다", () => {
    const r = mockAiReply("꼭짓점 그냥 알려줘");
    expect(r).toContain("꼭짓점은 (p, q)예요");
    expect(r).toContain("직접");
  });

  it("어렵다고 하면 공감하고 다음 단계를 안내한다", () => {
    const r = mockAiReply("이차함수 어려워");
    expect(r.startsWith("어렵게 느껴질 수 있어요")).toBe(true);
  });

  it("사전에 없는 주제는 개념 이름이나 문제를 보내 달라고 한다", () => {
    expect(mockAiReply("탄젠트 어떻게 생겼지?")).toContain("보내 주면");
  });

  it("주제는 질문 글자에서만 찾는다 (학습 목표로 대신 찾으면 다른 개념을 물었을 때 엉뚱한 설명이 나감)", () => {
    expect(mockAiReply.length).toBe(1); // 목표를 받지 않는다
    expect(mockAiReply("탄젠트 어떻게 생겼지?")).not.toContain("음수");
  });

  it("모든 답: 되묻는 질문 최대 1개, 마크다운 기호 없음, 반말 어미 없음", () => {
    for (const q of ["부등식에서 음수를 곱하면 왜 방향이 바뀌어?", "꼭짓점 그냥 알려줘", "이차함수 어려워", "탄젠트 어떻게 생겼지?", "정답만 알려줘", "오늘 꼭짓점 정리했어", "질량 보존 법칙이 뭐야?"]) {
      const r = mockAiReply(q);
      expect(questionMarks(r), r).toBeLessThanOrEqual(1);
      expect(MARKDOWN.test(r), r).toBe(false);
      expect(/(해 봐|말해 줘|줄래\?|알지\?)/.test(r), r).toBe(false);
    }
  });
});

describe("시드 AI 답변", () => {
  it("시드의 모든 AI 답변도 질문 최대 1개·마크다운 없음", async () => {
    const { createSeed } = await import("./mockData");
    const ai = createSeed(new Date("2026-11-13T19:00:00+09:00")).aiMessages.filter((m) => m.role === "ai");
    expect(ai.length).toBeGreaterThan(0);
    for (const m of ai) {
      expect(questionMarks(m.content), m.content).toBeLessThanOrEqual(1);
      expect(MARKDOWN.test(m.content), m.content).toBe(false);
    }
  });
});
