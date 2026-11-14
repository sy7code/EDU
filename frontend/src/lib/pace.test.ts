import { describe, expect, it } from "vitest";
import type { LearningEntry, LearningSession, Reflection } from "../types/domain";
import { computeDailyPace, isMeaningfulEntry, paceFeedback, paceSince, paceTrend, weekDates, weekSeries, type PaceAttempt, type PaceDay, type PaceInputs } from "./pace";

let n = 0;
function session(date: string, minutes: number, hour = 15): LearningSession {
  const startedAt = `${date}T${String(hour).padStart(2, "0")}:00:00+09:00`;
  const end = new Date(Date.parse(startedAt) + minutes * 60000).toISOString();
  return {
    id: `s${++n}`,
    studentId: "st",
    goal: { subject: "수학", activities: [] },
    startedAt: new Date(startedAt).toISOString(),
    endedAt: end,
    startAuth: "FACEPASS",
    endAuth: "FACEPASS",
    status: "ENDED",
    durationMinutes: minutes,
  };
}
function entry(s: LearningSession, kind: LearningEntry["kind"], content: string, visibility: LearningEntry["visibility"] = "TEACHER"): LearningEntry {
  return { id: `e${++n}`, sessionId: s.id, kind, content, visibility, createdAt: s.startedAt };
}
function inputs(p: Partial<PaceInputs>): PaceInputs {
  return { sessions: [], entries: [], reflections: [], attempts: [], ...p };
}
const LONG = "열 글자가 넘는 메모예요";

describe("computeDailyPace 지속성", () => {
  it("평소 기록이 3일 미만이면 30분 기준: 30분 → 25, 15분 → 13", () => {
    const a = session("2026-11-10", 30);
    const b = session("2026-11-11", 15);
    expect(computeDailyPace(inputs({ sessions: [a] }), "2026-11-10")?.parts.persistence).toBe(25);
    expect(computeDailyPace(inputs({ sessions: [b] }), "2026-11-11")?.parts.persistence).toBe(13);
  });
});

describe("computeDailyPace 평소 학습 시간", () => {
  it("이전 28일 학습일이 3일 이상이면 하루 합계의 중앙값이 기준: 기준 60분에 30분 → 13", () => {
    // 11-01은 같은 날 두 번 (20+40=60), 10-20 40분, 10-25 80분 → 중앙값 60. 10-10은 28일 밖이라 제외
    const prior = [session("2026-11-01", 20, 9), session("2026-11-01", 40, 14), session("2026-10-20", 40), session("2026-10-25", 80), session("2026-10-10", 500)];
    const today = session("2026-11-14", 30);
    expect(computeDailyPace(inputs({ sessions: [...prior, today] }), "2026-11-14")?.parts.persistence).toBe(13);
  });
});

describe("computeDailyPace 과정 기록", () => {
  it("10자 이상 공개 메모·질문과 공개 종이 기록만 센다: 나만 보기(종이 포함)·짧은 글·퀴즈 제외", () => {
    // 평소 기준을 하루 10개로 올려 25점 상한에 걸리지 않게 한다. 제외 대상이 하나라도 세지면 점수가 달라진다
    const prior = ["2026-11-03", "2026-11-04", "2026-11-05"].map((d) => session(d, 30));
    const priorEntries = prior.flatMap((p) => Array.from({ length: 10 }, () => entry(p, "MEMO", LONG)));
    const s = session("2026-11-14", 30);
    const one = [entry(s, "MEMO", LONG)];
    const counted = [entry(s, "QUESTION", LONG), entry(s, "PAPER", "짧음")];
    const ignored = [
      entry(s, "PAPER", "짧음", "PRIVATE"),
      entry(s, "MEMO", LONG, "PRIVATE"),
      entry(s, "QUESTION", LONG, "PRIVATE"),
      entry(s, "MEMO", "  짧은 메모      "),
      entry(s, "QUIZ", LONG),
    ];
    const process = (today: LearningEntry[]) =>
      computeDailyPace(inputs({ sessions: [...prior, s], entries: [...priorEntries, ...today] }), "2026-11-14")?.parts.process;
    expect(process(one)).toBe(3); // 1/10 × 25 = 2.5 → 3
    expect(process([...one, ...ignored])).toBe(3); // 제외 대상 5개는 0개로 친다
    expect(process([...one, ...counted])).toBe(8); // 3/10 × 25 = 7.5 → 8
    expect(process([...one, ...counted, ...ignored])).toBe(8);
    // 제외 대상 하나만 세져도 4/10 × 25 = 10이 되므로 위 단언이 깨진다
    for (const e of ignored) expect(isMeaningfulEntry(e)).toBe(false);
  });

  it("이전 학습일 3일 이상이면 하루 평균 기록 수가 기준 (최소 2): 평균 4개에 2개 → 13", () => {
    const prior = ["2026-11-03", "2026-11-04", "2026-11-05"].map((d) => session(d, 30));
    const priorEntries = [...prior.flatMap((p) => [1, 2, 3, 4].map(() => entry(p, "MEMO", LONG)))];
    const s = session("2026-11-14", 30);
    const today = [entry(s, "MEMO", LONG), entry(s, "PAPER", "x")];
    expect(computeDailyPace(inputs({ sessions: [...prior, s], entries: [...priorEntries, ...today] }), "2026-11-14")?.parts.process).toBe(13);
  });
});

describe("computeDailyPace 성찰", () => {
  function refl(s: LearningSession, p: Partial<Reflection>): Reflection {
    return { sessionId: s.id, checks: [], understanding: 2, remainingQuestions: [], ...p };
  }
  it("돌아보기 6 + 체크 2개 이상 6 + 남은 질문·메모 8, 그날 세션 중 가장 높은 것", () => {
    const a = session("2026-11-14", 10, 9);
    const b = session("2026-11-14", 10, 15);
    const score = (rs: Reflection[]) => computeDailyPace(inputs({ sessions: [a, b], reflections: rs }), "2026-11-14")?.parts.reflection;
    expect(score([])).toBe(0);
    expect(score([refl(a, {})])).toBe(6);
    expect(score([refl(a, { checks: ["x", "y"] })])).toBe(12);
    expect(score([refl(a, { checks: ["x"], note: "  " }), refl(b, { checks: ["x", "y"], remainingQuestions: ["왜?"] })])).toBe(20);
    expect(score([refl(a, { note: "메모" })])).toBe(14);
  });
});

describe("computeDailyPace 목표 달성", () => {
  const goalDone = (s: LearningSession): Reflection => ({ sessionId: s.id, checks: ["goal_done"], understanding: 2, remainingQuestions: [] });
  const attempt = (s: LearningSession, correct: number, total: number): PaceAttempt => ({ sessionId: s.id, correct, total, createdAt: s.startedAt });
  it("테스트를 안 봤으면 목표 체크로만 30 환산", () => {
    const s = session("2026-11-14", 30);
    expect(computeDailyPace(inputs({ sessions: [s], reflections: [goalDone(s)] }), "2026-11-14")?.parts.goal).toBe(30);
    expect(computeDailyPace(inputs({ sessions: [s] }), "2026-11-14")?.parts.goal).toBe(0);
  });
  it("테스트를 봤으면 목표 체크 15 + 정답률 평균 × 15 (total 0 응시는 제외)", () => {
    const a = session("2026-11-14", 30, 9);
    const b = session("2026-11-14", 30, 15);
    const atts = [attempt(a, 5, 5), attempt(b, 1, 5), attempt(b, 0, 0)];
    expect(computeDailyPace(inputs({ sessions: [a, b], reflections: [goalDone(a)], attempts: atts }), "2026-11-14")?.parts.goal).toBe(24);
    expect(computeDailyPace(inputs({ sessions: [a, b], attempts: [attempt(a, 0, 0)] }), "2026-11-14")?.parts.goal).toBe(0);
  });
  it("합계는 항목 점수의 합", () => {
    const s = session("2026-11-14", 30);
    const p = computeDailyPace(inputs({ sessions: [s], reflections: [goalDone(s)] }), "2026-11-14")!;
    expect(p.total).toBe(25 + 0 + 6 + 30);
  });
});

describe("weekDates", () => {
  it("평일이면 그 주 월~금, 토·일도 그 주 월~금 (서울 기준)", () => {
    const week = ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"];
    expect(weekDates(new Date("2026-11-11T10:00:00+09:00"))).toEqual(week);
    expect(weekDates(new Date("2026-11-14T10:00:00+09:00"))).toEqual(week); // 토
    expect(weekDates(new Date("2026-11-15T23:30:00+09:00"))).toEqual(week); // 일 밤
    expect(weekDates(new Date("2026-11-09T00:10:00+09:00"))).toEqual(week); // 월 새벽 (UTC로는 일요일)
  });
});

describe("paceSince", () => {
  it("이번 서울 주 월요일 0시에서 28일 전 (토·일·월 새벽도 같은 주)", () => {
    const since = "2026-10-11T15:00:00.000Z"; // 2026-10-12 00:00 KST
    expect(paceSince(new Date("2026-11-11T10:00:00+09:00"))).toBe(since);
    expect(paceSince(new Date("2026-11-15T23:30:00+09:00"))).toBe(since);
    expect(paceSince(new Date("2026-11-09T00:10:00+09:00"))).toBe(since);
  });
  it("그 시각 이후 세션만 있어도 월요일 평소 기준이 같다", () => {
    const now = new Date("2026-11-14T10:00:00+09:00");
    const prior = [session("2026-10-13", 60), session("2026-10-20", 60), session("2026-11-01", 60)];
    const old = session("2026-10-11", 500);
    const mon = session("2026-11-09", 30);
    const all = weekSeries(inputs({ sessions: [old, ...prior, mon] }), now);
    const since = Date.parse(paceSince(now));
    const recent = [old, ...prior, mon].filter((s) => Date.parse(s.startedAt) >= since);
    expect(recent).not.toContain(old);
    expect(weekSeries(inputs({ sessions: recent }), now)).toEqual(all);
  });
});

describe("weekSeries", () => {
  it("월~금 요일 이름과 점수, 학습 안 한 날은 null", () => {
    const mon = session("2026-11-09", 30);
    const wed = session("2026-11-11", 30);
    const series = weekSeries(inputs({ sessions: [mon, wed] }), new Date("2026-11-14T10:00:00+09:00"));
    expect(series.map((d) => d.label)).toEqual(["월", "화", "수", "목", "금"]);
    expect(series.map((d) => d.pace?.total ?? null)).toEqual([25, null, 25, null, null]);
  });
});

function day(label: string, total: number | null): PaceDay {
  return {
    date: label,
    label,
    pace: total == null ? null : { date: label, total, parts: { persistence: 0, process: 0, reflection: 0, goal: 0 } },
  };
}

describe("paceTrend", () => {
  it("첫 학습일과 마지막 학습일 차이: +5 이상 상승, -5 이하 낮음, 그 사이 비슷, 2점 미만이면 없음", () => {
    expect(paceTrend([day("월", 50), day("화", null), day("수", 55)])).toEqual({ tone: "up", label: "이번 주 상승세", diff: 5 });
    expect(paceTrend([day("월", 50), day("수", 45), day("금", null)])).toEqual({ tone: "down", label: "지난 학습보다 낮아요", diff: -5 });
    expect(paceTrend([day("월", 50), day("수", 54)])).toEqual({ tone: "flat", label: "비슷해요", diff: 4 });
    expect(paceTrend([day("월", null), day("수", 54)])).toBeNull();
  });
});

describe("paceFeedback", () => {
  const pace = (parts: { persistence: number; process: number; reflection: number; goal: number }) => ({
    date: "x",
    total: parts.persistence + parts.process + parts.reflection + parts.goal,
    parts,
  });
  it("첫 학습일과 비교한 문장 + 고른 날의 가장 약한 항목(만점 대비) 힌트", () => {
    const series = [day("월", 50), day("화", null), day("수", 66)];
    const selected = pace({ persistence: 25, process: 20, reflection: 6, goal: 15 });
    expect(paceFeedback(series, selected)).toBe(
      "이번 주 Pace 지수는 월요일보다 16점 높아졌어요. 자기 성찰 점수가 낮았어요. 돌아보기에 남은 질문을 적어 보세요.",
    );
  });
  it("낮아졌거나 비슷하면 그에 맞는 문장, 모두 만점이면 칭찬", () => {
    const full = pace({ persistence: 25, process: 25, reflection: 20, goal: 30 });
    expect(paceFeedback([day("월", 70), day("목", 60)], full)).toBe("이번 주 Pace 지수는 월요일보다 10점 낮아졌어요. 모든 항목을 고르게 채웠어요.");
    expect(paceFeedback([day("월", 70), day("목", 70)], full)).toBe("이번 주 Pace 지수는 월요일과 비슷해요. 모든 항목을 고르게 채웠어요.");
  });
  it("학습일이 하루뿐이면 그날 점수 문장, 없으면 안내만", () => {
    const sel = pace({ persistence: 5, process: 25, reflection: 20, goal: 30 });
    expect(paceFeedback([day("화", 80)], sel)).toBe("이번 주는 화요일에 Pace 지수 80점이었어요. 학습 시간이 평소보다 짧았어요. 조금 더 이어서 공부해 보세요.");
    expect(paceFeedback([day("월", null)], null)).toBe("이번 주 학습 기록이 아직 없어요. 학습을 시작하면 Pace 지수가 생겨요.");
  });
});

describe("computeDailyPace 잘못된 입력", () => {
  it("startedAt을 읽을 수 없는 세션은 건너뛴다 (오류 없이 나머지로 계산)", () => {
    const ok = session("2026-11-14", 30);
    const bad = { ...session("2026-11-14", 30), startedAt: "not-a-date" };
    expect(computeDailyPace(inputs({ sessions: [bad, ok] }), "2026-11-14")?.parts.persistence).toBe(25);
    expect(weekSeries(inputs({ sessions: [bad] }), new Date("2026-11-14T10:00:00+09:00")).every((d) => d.pace === null)).toBe(true);
  });

  it("학습 시간이 NaN이면 0분으로 친다 (같은 날 다른 세션 점수는 그대로)", () => {
    const ok = session("2026-11-14", 15, 9);
    const nanDuration = { ...session("2026-11-14", 30, 10), durationMinutes: Number.NaN };
    const badEnd = { ...session("2026-11-14", 30, 11), durationMinutes: null, endedAt: "not-a-date" };
    const p = computeDailyPace(inputs({ sessions: [ok, nanDuration, badEnd] }), "2026-11-14");
    expect(p?.parts.persistence).toBe(13);
    expect(p?.total).toBe(13);
  });

  it("정답률은 0~1로 자른다: correct > total이나 음수가 목표 30을 넘기지 못한다", () => {
    const s = session("2026-11-14", 30);
    const goalDone: Reflection = { sessionId: s.id, checks: ["goal_done", "x"], understanding: 2, remainingQuestions: ["왜?"] };
    const att = (correct: number, total: number): PaceAttempt => ({ sessionId: s.id, correct, total, createdAt: s.startedAt });
    const over = computeDailyPace(inputs({ sessions: [s], reflections: [goalDone], attempts: [att(50, 5)] }), "2026-11-14")!;
    expect(over.parts.goal).toBe(30);
    expect(over.total).toBe(25 + 0 + 20 + 30);
    expect(computeDailyPace(inputs({ sessions: [s], attempts: [att(-5, 5)] }), "2026-11-14")?.parts.goal).toBe(0);
    expect(computeDailyPace(inputs({ sessions: [s], attempts: [att(5, -5)] }), "2026-11-14")?.parts.goal).toBe(0);
  });
});
