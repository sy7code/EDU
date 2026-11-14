import { describe, expect, it } from "vitest";
import { buildNotebook } from "./notebook";
import type { LearningEntry, LearningSession, Reflection } from "../types/domain";

const session = (id: string, startedAt: string, subject = "수학"): LearningSession => ({
  id,
  studentId: "s01",
  goal: { subject, activities: ["concept"] },
  startedAt,
  endedAt: null,
  startAuth: "QR",
  endAuth: null,
  status: "ENDED",
  durationMinutes: 30,
});
const entry = (id: string, sessionId: string, content: string, createdAt: string, visibility: "TEACHER" | "PRIVATE" = "TEACHER"): LearningEntry => ({
  id,
  sessionId,
  kind: "MEMO",
  content,
  visibility,
  createdAt,
});
const refl = (sessionId: string, over: Partial<Reflection> = {}): Reflection => ({
  sessionId,
  checks: ["new_learned"],
  understanding: 2,
  remainingQuestions: [],
  ...over,
});

const S = [session("a", "2026-11-10T10:00:00Z"), session("b", "2026-11-12T10:00:00Z", "영어")];
const E = [
  entry("e2", "a", "꼭짓점 공식 정리", "2026-11-10T10:20:00Z"),
  entry("e1", "a", "비밀 메모", "2026-11-10T10:10:00Z", "PRIVATE"),
  entry("e3", "b", "관계대명사 예문", "2026-11-12T10:10:00Z"),
];
const R = [refl("a", { remainingQuestions: ["판별식은 언제 쓰지?"] }), refl("b", { note: "which와 that 차이", remainingQuestions: [] })];

describe("내 정리", () => {
  it("세션을 최근 순으로, 기록은 시간 순으로 묶고 비공개 메모도 포함한다", () => {
    const nb = buildNotebook(S, E, R);
    expect(nb.sessions.map((x) => x.session.id)).toEqual(["b", "a"]);
    expect(nb.sessions[1].entries.map((e) => e.id)).toEqual(["e1", "e2"]);
    expect(nb.sessions[1].reflection?.remainingQuestions).toEqual(["판별식은 언제 쓰지?"]);
  });

  it("남은 질문을 세션 날짜와 함께 최근 순으로 모은다", () => {
    const S2 = [...S, session("c", "2026-11-13T10:00:00Z")];
    const R2 = [...R, refl("c", { remainingQuestions: ["근의 공식 유도", " "] })];
    expect(buildNotebook(S2, E, R2).openQuestions.map((q) => q.text)).toEqual(["근의 공식 유도", "판별식은 언제 쓰지?"]);
  });

  it("기록도 돌아보기도 없는 세션은 빼고, 진행 중 세션의 기록은 보여 준다", () => {
    const S3 = [...S, session("empty", "2026-11-13T10:00:00Z"), { ...session("live", "2026-11-14T10:00:00Z"), status: "ACTIVE" as const }];
    const E3 = [...E, entry("e4", "live", "지금 쓰는 중", "2026-11-14T10:05:00Z")];
    expect(buildNotebook(S3, E3, R).sessions.map((x) => x.session.id)).toEqual(["live", "b", "a"]);
  });

  it("검색어는 기록·돌아보기 메모·남은 질문·목표·체크 항목 글자에서 찾고, 세션 안에서는 맞는 기록만 남긴다", () => {
    const byMemo = buildNotebook(S, E, R, "꼭짓점");
    expect(byMemo.sessions.map((x) => x.session.id)).toEqual(["a"]);
    expect(byMemo.sessions[0].entries.map((e) => e.id)).toEqual(["e2"]);
    expect(buildNotebook(S, E, R, "that").sessions.map((x) => x.session.id)).toEqual(["b"]);
    expect(buildNotebook(S, E, R, "판별식").openQuestions).toHaveLength(1);
    expect(buildNotebook(S, E, R, "영어").sessions.map((x) => x.session.id)).toEqual(["b"]);
    expect(buildNotebook(S, E, R, "새로 알게").sessions).toHaveLength(2);
    expect(buildNotebook(S, E, R, "없는말").sessions).toHaveLength(0);
  });

  it("목표·돌아보기로 맞은 세션은 기록을 거르지 않는다", () => {
    expect(buildNotebook(S, E, R, "영어").sessions[0].entries).toHaveLength(1);
  });
});
