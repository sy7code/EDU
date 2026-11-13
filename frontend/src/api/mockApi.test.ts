import { beforeEach, describe, expect, it } from "vitest";
import { createMockApi } from "./mockApi";
import { createSeed } from "./mockData";
import { ApiError, type Api } from "./types";
import type { SessionGoal } from "../types/domain";

const DEVICE = "kiosk-test";
const GOAL: SessionGoal = { subject: "수학", activities: ["concept"] };

let clock: Date;
let aiPayloads: string[];
let api: Api;

function advance(ms: number) {
  clock = new Date(clock.getTime() + ms);
}

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof ApiError && e.code === code);
}

async function startAs(studentId: string) {
  await api.login(studentId);
  const ev = await api.submitFaceAuth(DEVICE, {
    merchantUserKey: `serial-${studentId}`,
    authenticated: true,
    result: "Authenticated",
    message: "",
  });
  return api.startSession({ goal: GOAL, authEventId: ev.id });
}

beforeEach(() => {
  clock = new Date("2026-11-13T19:00:00+09:00");
  aiPayloads = [];
  api = createMockApi({
    seed: createSeed(clock),
    now: () => clock,
    latencyMs: 0,
    storage: null,
    onAiPayload: (p) => aiPayloads.push(p),
  });
});

describe("페이스패스 인증", () => {
  it("시리얼을 학생으로 매핑하고 이름은 마스킹해서 돌려준다", async () => {
    const ev = await api.submitFaceAuth(DEVICE, {
      merchantUserKey: "serial-s01",
      authenticated: true,
      result: "Authenticated",
      message: "",
    });
    expect(ev.studentId).toBe("s01");
    expect(ev.success).toBe(true);
    expect(ev.maskedName).toMatch(/\*/);
  });

  it("등록되지 않은 시리얼은 실패로 기록한다", async () => {
    const ev = await api.submitFaceAuth(DEVICE, {
      merchantUserKey: "serial-unknown",
      authenticated: true,
      result: "Authenticated",
      message: "",
    });
    expect(ev.success).toBe(false);
    expect(ev.studentId).toBeNull();
  });

  it("페이스패스 동의가 없는 학생의 얼굴 인증은 실패로 기록한다", async () => {
    const ev = await api.submitFaceAuth(DEVICE, {
      merchantUserKey: "serial-s03",
      authenticated: true,
      result: "Authenticated",
      message: "",
    });
    expect(ev.success).toBe(false);
  });
});

describe("세션 시작 규칙", () => {
  it("같은 인증 이벤트로 두 번 시작할 수 없다", async () => {
    await api.login("s01");
    const ev = await api.submitFaceAuth(DEVICE, {
      merchantUserKey: "serial-s01",
      authenticated: true,
      result: "Authenticated",
      message: "",
    });
    const s = await api.startSession({ goal: GOAL, authEventId: ev.id });
    advance(60_000);
    await api.endSession(s.id, (await api.simulateFaceAuth(DEVICE, "s01", true)).id);
    await expectCode(api.startSession({ goal: GOAL, authEventId: ev.id }), "AUTH_EVENT_INVALID");
  });

  it("2분이 지난 인증 이벤트는 쓸 수 없다", async () => {
    await api.login("s01");
    const ev = await api.simulateFaceAuth(DEVICE, "s01", true);
    advance(121_000);
    await expectCode(api.startSession({ goal: GOAL, authEventId: ev.id }), "AUTH_EVENT_INVALID");
  });

  it("다른 학생의 인증 이벤트로 시작할 수 없다", async () => {
    await api.login("s01");
    const ev = await api.simulateFaceAuth(DEVICE, "s02", true);
    await expectCode(api.startSession({ goal: GOAL, authEventId: ev.id }), "AUTH_STUDENT_MISMATCH");
  });

  it("진행 중인 세션이 있으면 새로 시작할 수 없다", async () => {
    await startAs("s01");
    const ev2 = await api.simulateFaceAuth(DEVICE, "s01", true);
    await expectCode(api.startSession({ goal: GOAL, authEventId: ev2.id }), "SESSION_ALREADY_ACTIVE");
  });

  it("종료 시 학습 시간을 인증 시각으로 계산한다", async () => {
    const s = await startAs("s01");
    advance(45 * 60_000);
    const ended = await api.endSession(s.id, (await api.simulateFaceAuth(DEVICE, "s01", true)).id);
    expect(ended.status).toBe("ENDED");
    expect(ended.durationMinutes).toBe(45);
  });

  it("QR 학생은 얼굴 동의 없이도 시작할 수 있다", async () => {
    await api.login("s03");
    const { token } = await api.issueQrToken();
    const ev = await api.submitCodeAuth(DEVICE, "QR", token);
    expect(ev.success).toBe(true);
    const s = await api.startSession({ goal: GOAL, authEventId: ev.id });
    expect(s.startAuth).toBe("QR");
  });

  it("시작하면 같은 학생의 남은 인증 이벤트는 모두 무효가 된다", async () => {
    await api.login("s01");
    await api.simulateFaceAuth(DEVICE, "s01", true);
    advance(10_000);
    const latest = await api.simulateFaceAuth(DEVICE, "s01", true);
    await api.startSession({ goal: GOAL, authEventId: latest.id });
    expect(await api.getPendingAuthEvent()).toBeNull();
  });

  it("세션 시작 전에 만든 인증으로는 종료할 수 없다", async () => {
    await api.login("s01");
    const early = await api.simulateFaceAuth(DEVICE, "s01", true);
    advance(10_000);
    const s = await api.startSession({ goal: GOAL, authEventId: (await api.simulateFaceAuth(DEVICE, "s01", true)).id });
    await expectCode(api.endSession(s.id, early.id), "AUTH_EVENT_INVALID");
  });
});

describe("QR·바코드 토큰", () => {
  it("학생 ID로 만든 예측 가능한 QR 값은 통하지 않는다", async () => {
    const ev = await api.submitCodeAuth(DEVICE, "QR", "qr-s03");
    expect(ev.success).toBe(false);
  });

  it("QR 토큰은 한 번만 쓸 수 있다", async () => {
    await api.login("s03");
    const { token } = await api.issueQrToken();
    await api.submitCodeAuth(DEVICE, "QR", token);
    const second = await api.submitCodeAuth(DEVICE, "QR", token);
    expect(second.success).toBe(false);
  });

  it("QR 토큰은 60초가 지나면 쓸 수 없다", async () => {
    await api.login("s03");
    const { token } = await api.issueQrToken();
    advance(61_000);
    const ev = await api.submitCodeAuth(DEVICE, "QR", token);
    expect(ev.success).toBe(false);
  });
});

describe("권한", () => {
  it("학생은 다른 학생의 세션을 볼 수 없다", async () => {
    const s = await startAs("s01");
    await api.login("s02");
    await expectCode(api.getSession(s.id), "NOT_FOUND");
  });

  it("교사는 PRIVATE 기록을 볼 수 없다", async () => {
    const s = await startAs("s01");
    await api.addEntry({ sessionId: s.id, kind: "MEMO", content: "공개", visibility: "TEACHER" });
    await api.addEntry({ sessionId: s.id, kind: "MEMO", content: "비공개", visibility: "PRIVATE" });
    await api.login("t1");
    const entries = await api.listEntries(s.id);
    expect(entries.map((e) => e.content)).toEqual(["공개"]);
  });

  it("기록 공유에 동의하지 않은 학생의 기록은 교사 공개로 요청해도 비공개로 저장된다", async () => {
    const s = await startAs("s01");
    await api.saveConsents([
      { kind: "FACEPASS", granted: true, byGuardian: false },
      { kind: "AI", granted: true, byGuardian: false },
      { kind: "LEARNING_RECORD", granted: false, byGuardian: false },
    ]);
    const e = await api.addEntry({ sessionId: s.id, kind: "MEMO", content: "메모", visibility: "TEACHER" });
    expect(e.visibility).toBe("PRIVATE");
  });

  it("학생은 반 명단을 조회할 수 없다", async () => {
    await api.login("s01");
    await expectCode(api.listStudents("c1"), "FORBIDDEN");
  });

  it("기록 공유에 동의하지 않은 학생의 성찰은 교사에게 보이지 않는다", async () => {
    const s = await startAs("s01");
    advance(60_000);
    await api.endSession(s.id, (await api.simulateFaceAuth(DEVICE, "s01", true)).id);
    await api.saveReflection({ sessionId: s.id, checks: [], understanding: 2, remainingQuestions: ["고민 상담"], note: "비밀" });
    await api.saveConsents([
      { kind: "FACEPASS", granted: true, byGuardian: false },
      { kind: "AI", granted: true, byGuardian: false },
      { kind: "LEARNING_RECORD", granted: false, byGuardian: false },
    ]);
    await api.login("t1");
    expect(await api.getReflection(s.id)).toBeNull();
  });

  it("기록 공유 동의를 철회하면 이미 공개한 기록도 교사에게 숨겨진다", async () => {
    const s = await startAs("s01");
    await api.addEntry({ sessionId: s.id, kind: "MEMO", content: "예전 공개", visibility: "TEACHER" });
    await api.saveConsents([
      { kind: "FACEPASS", granted: true, byGuardian: false },
      { kind: "AI", granted: true, byGuardian: false },
      { kind: "LEARNING_RECORD", granted: false, byGuardian: false },
    ]);
    await api.login("t1");
    expect(await api.listEntries(s.id)).toEqual([]);
  });

  it("만 14세 미만은 보호자 동의 없이 동의를 저장할 수 없다", async () => {
    await api.login("s30");
    await expectCode(
      api.saveConsents([{ kind: "AI", granted: true, byGuardian: false }]),
      "VALIDATION",
    );
  });

  it("다른 반 교사는 세션을 볼 수 없다", async () => {
    const s = await startAs("s01");
    await api.login("t2");
    await expectCode(api.getSession(s.id), "NOT_FOUND");
  });

  it("학생은 피드백을 쓸 수 없다", async () => {
    const s = await startAs("s01");
    await expectCode(api.addFeedback(s.id, "셀프 칭찬"), "FORBIDDEN");
  });

  it("교사 수기 인증은 교사만 할 수 있다", async () => {
    await api.login("s01");
    await expectCode(api.submitManualAuth("s01"), "FORBIDDEN");
  });
});

describe("AI", () => {
  it("AI 동의가 없으면 AI를 쓸 수 없다", async () => {
    const s = await startAs("s04");
    await expectCode(api.askAi(s.id, "질문"), "CONSENT_REQUIRED");
  });

  it("AI로 보내는 내용에서 연락처와 학생 이름을 가린다", async () => {
    const s = await startAs("s01");
    const students = createSeed(clock).users.filter((u) => u.role === "student");
    const other = students[1].name;
    await api.askAi(s.id, `${other}한테 010-1234-5678로 물어봤는데 모르겠어`);
    const sent = aiPayloads.join("\n");
    expect(sent).not.toContain("010-1234-5678");
    expect(sent).not.toContain(other);
  });

  it("저장되는 AI 대화에도 연락처가 남지 않는다", async () => {
    const s = await startAs("s01");
    await api.askAi(s.id, "010-1234-5678 이 번호로 물어봐도 돼?");
    await api.login("t1");
    const msgs = await api.listAiMessages(s.id);
    expect(msgs.map((m) => m.content).join("\n")).not.toContain("010-1234-5678");
  });

  it("요약의 모든 문장은 공개 기록을 근거로 가진다", async () => {
    const s = await startAs("s01");
    const pub = await api.addEntry({ sessionId: s.id, kind: "QUESTION", content: "왜 -b/2a 인가?", visibility: "TEACHER" });
    const priv = await api.addEntry({ sessionId: s.id, kind: "MEMO", content: "비밀 메모", visibility: "PRIVATE" });
    const sum = await api.summarizeSession(s.id);
    const all = [...sum.activities, ...sum.remainingQuestions];
    expect(all.length).toBeGreaterThan(0);
    for (const item of all) {
      expect(item.evidenceIds.length).toBeGreaterThan(0);
      expect(item.evidenceIds).not.toContain(priv.id);
    }
    expect(all.flatMap((i) => i.evidenceIds)).toContain(pub.id);
  });
});

describe("교차채점", () => {
  it("근거가 없는 기준은 AI가 점수를 비워 둔다", async () => {
    const s = await startAs("s01");
    advance(60_000);
    await api.endSession(s.id, (await api.simulateFaceAuth(DEVICE, "s01", true)).id);
    await api.login("t1");
    const a = await api.requestAiAssessment(s.id);
    const questioning = a.ai?.find((c) => c.criterionId === "questioning");
    expect(questioning?.level).toBeNull();
  });

  it("학생은 교사 확정 전 AI 채점을 볼 수 없다", async () => {
    const s = await startAs("s01");
    await api.addEntry({ sessionId: s.id, kind: "QUESTION", content: "질문", visibility: "TEACHER" });
    advance(60_000);
    await api.endSession(s.id, (await api.simulateFaceAuth(DEVICE, "s01", true)).id);
    await api.login("t1");
    await api.requestAiAssessment(s.id);
    await api.login("s01");
    const seen = await api.getAssessment(s.id);
    expect(seen?.ai ?? null).toBeNull();
  });

  it("학생은 AI 채점을 요청할 수 없다", async () => {
    const s = await startAs("s01");
    await expectCode(api.requestAiAssessment(s.id), "FORBIDDEN");
  });
});
