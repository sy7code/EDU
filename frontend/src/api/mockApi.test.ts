import { beforeEach, describe, expect, it } from "vitest";
import { createMockApi, MOCK_FAIL_KEY, MOCK_SLOW_KEY } from "./mockApi";
import { createSeed } from "./mockData";
import { TOPIC_DICTIONARY } from "./mockTopicData";
import { ApiError, type Api } from "./types";
import type { SessionGoal } from "../types/domain";
import { reviewTopicsBySubject } from "../lib/reviewTopics";

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
    // 기존 테스트는 '신고 = 채점 제외·교사에게'를 전제로 하므로 AI 1차 검토가 오류로 보는 쪽을 기본으로 둔다
    reviewQuestion: () => ({ verdict: "ERROR", reason: "테스트 기본" }),
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

  it("내 정리: 학생은 자기 세션의 비공개 기록·돌아보기까지 받고, 다른 학생 것은 받지 않는다", async () => {
    const s = await startAs("s01");
    await api.addEntry({ sessionId: s.id, kind: "MEMO", content: "나만 볼 메모", visibility: "PRIVATE" });
    advance(60_000);
    await api.endSession(s.id, (await api.simulateFaceAuth(DEVICE, "s01", true)).id);
    await api.saveReflection({ sessionId: s.id, checks: [], understanding: 2, remainingQuestions: ["남은 것"] });
    const mine = await api.listMyNotes();
    expect(mine.sessions.every((x) => x.studentId === "s01")).toBe(true);
    expect(mine.sessions.some((x) => x.id === s.id)).toBe(true);
    expect(mine.entries.some((e) => e.content === "나만 볼 메모")).toBe(true);
    expect(mine.reflections.some((r) => r.sessionId === s.id && r.remainingQuestions[0] === "남은 것")).toBe(true);
    const ids = new Set(mine.sessions.map((x) => x.id));
    expect(mine.entries.every((e) => ids.has(e.sessionId))).toBe(true);
    expect(mine.reflections.every((r) => ids.has(r.sessionId))).toBe(true);
  });

  it("내 정리는 학생만 부를 수 있다", async () => {
    await api.login("t1");
    await expectCode(api.listMyNotes(), "FORBIDDEN");
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
      "GUARDIAN_CONSENT_REQUIRED",
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

  it("AI에 동의하지 않은 학생의 세션은 요약하지 않는다 (서버 4-1)", async () => {
    const s = await startAs("s04");
    await api.addEntry({ sessionId: s.id, kind: "MEMO", content: "공개 메모", visibility: "TEACHER" });
    await expectCode(api.summarizeSession(s.id), "CONSENT_REQUIRED");
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

describe("주제 추출", () => {
  async function sessionWith(studentId: string, entries: Array<{ content: string; visibility?: "TEACHER" | "PRIVATE" }>, end = true) {
    await api.login(studentId);
    const ev = await api.simulateFaceAuth(DEVICE, studentId, true);
    const s = await api.startSession({ goal: { subject: "공부", activities: ["concept"] }, authEventId: ev.id });
    const ids: string[] = [];
    for (const e of entries) {
      ids.push((await api.addEntry({ sessionId: s.id, kind: "MEMO", content: e.content, visibility: e.visibility ?? "TEACHER" })).id);
    }
    if (end) {
      advance(60_000);
      await api.endSession(s.id, (await api.simulateFaceAuth(DEVICE, studentId, true)).id);
    }
    return { s, ids };
  }

  it("기록 키워드로 주제를 뽑고 근거 기록을 붙인다", async () => {
    const { s, ids } = await sessionWith("s01", [{ content: "완전제곱식으로 바꾸면 꼭짓점이 보인다" }, { content: "점심 먹음" }]);
    const topics = await api.extractTopics(s.id);
    expect(topics.map((t) => t.name)).toEqual(["이차함수 꼭짓점"]);
    expect(topics[0].evidenceIds).toEqual([ids[0]]);
  });

  it("근거가 없으면 주제를 만들지 않는다", async () => {
    const { s } = await sessionWith("s01", [{ content: "오늘은 그냥 책을 읽었다" }]);
    expect(await api.extractTopics(s.id)).toEqual([]);
  });

  it("PRIVATE 기록은 주제 근거로 쓰지 않는다", async () => {
    const { s } = await sessionWith("s01", [{ content: "꼭짓점 공부", visibility: "PRIVATE" }]);
    expect(await api.extractTopics(s.id)).toEqual([]);
  });

  it("같은 개념은 반 주제 사전의 같은 주제로 묶인다", async () => {
    const a = await sessionWith("s01", [{ content: "꼭짓점 구하기" }]);
    const ta = await api.extractTopics(a.s.id);
    advance(60_000);
    const b = await sessionWith("s02", [{ content: "완전제곱식 연습" }]);
    const tb = await api.extractTopics(b.s.id);
    expect(tb[0].topicId).toBe(ta[0].topicId);
  });

  it("주제는 최대 3개, 근거가 많은 순서", async () => {
    const { s } = await sessionWith("s01", [
      { content: "꼭짓점, 완전제곱식, 이차함수 축의 방정식" },
      { content: "부등식 부등호" },
      { content: "관계대명사 who" },
      { content: "질량 보존" },
    ]);
    const topics = await api.extractTopics(s.id);
    expect(topics.length).toBe(3);
    expect(topics[0].name).toBe("이차함수 꼭짓점");
  });

  it("다른 학생 세션의 주제는 뽑을 수 없다", async () => {
    const { s } = await sessionWith("s01", [{ content: "꼭짓점" }]);
    await api.login("s02");
    await expectCode(api.extractTopics(s.id), "NOT_FOUND");
  });

  it("진행 중인 세션은 주제를 뽑을 수 없다", async () => {
    const { s } = await sessionWith("s01", [{ content: "꼭짓점" }], false);
    await expectCode(api.extractTopics(s.id), "SESSION_NOT_ACTIVE");
  });
});

describe("주제 테스트", () => {
  /** 기록 하나로 끝낸 세션 → 주제 추출 → 첫 주제 */
  async function topicSession(studentId: string, content: string) {
    await api.login(studentId);
    const ev = await api.simulateFaceAuth(DEVICE, studentId, true);
    const s = await api.startSession({ goal: { subject: "공부", activities: ["concept"] }, authEventId: ev.id });
    await api.addEntry({ sessionId: s.id, kind: "MEMO", content, visibility: "TEACHER" });
    advance(60_000);
    await api.endSession(s.id, (await api.simulateFaceAuth(DEVICE, studentId, true)).id);
    const [topic] = await api.extractTopics(s.id);
    advance(60_000);
    return { s, topic };
  }
  /** 사전 문항 풀에서 정답 내용으로 답안 만들기 (받은 선택지 순서 기준) */
  function correctAnswers(questions: Array<{ id: string; prompt: string; choices: string[] }>) {
    const all = TOPIC_DICTIONARY.flatMap((d) => d.pool);
    return Object.fromEntries(
      questions.map((q) => {
        const src = all.find((x) => x.prompt === q.prompt)!;
        return [q.id, q.choices.indexOf(src.choices[src.answerIndex])];
      }),
    );
  }

  it("주제 테스트는 개념 3 + 적용 2, 5문항 고정이다", async () => {
    const { s, topic } = await topicSession("s01", "꼭짓점 공부");
    const quiz = await api.getQuiz(s.id, topic.topicId);
    expect(quiz.questions.length).toBe(5);
    const levels = quiz.questions.map((q) => TOPIC_DICTIONARY.flatMap((d) => d.pool).find((x) => x.prompt === q.prompt)!.level);
    expect(levels.filter((l) => l === "CONCEPT").length).toBe(3);
    expect(levels.filter((l) => l === "APPLY").length).toBe(2);
  });

  it("퀴즈 응답에는 정답과 해설이 없다", async () => {
    const { s, topic } = await topicSession("s01", "꼭짓점");
    const quiz = await api.getQuiz(s.id, topic.topicId);
    for (const q of quiz.questions) {
      expect(q).not.toHaveProperty("answerIndex");
      expect(q).not.toHaveProperty("explanation");
    }
  });

  it("같은 반 다른 학생도 같은 주제는 같은 문항 풀에서 나온다", async () => {
    const a = await topicSession("s01", "부등식");
    const qa = await api.getQuiz(a.s.id, a.topic.topicId);
    const b = await topicSession("s02", "부등호 방향");
    const qb = await api.getQuiz(b.s.id, b.topic.topicId);
    expect(b.topic.topicId).toBe(a.topic.topicId);
    expect(qb.questions.map((q) => q.id).sort()).toEqual(qa.questions.map((q) => q.id).sort());
  });

  it("이번 세션에서 추출된 주제만 응시할 수 있다", async () => {
    const a = await topicSession("s01", "관계대명사");
    const b = await topicSession("s01", "꼭짓점");
    await expectCode(api.getQuiz(b.s.id, a.topic.topicId), "QUIZ_NOT_AVAILABLE");
  });

  it("다시 불러도 같은 문항·같은 선택지 순서다 (출제 스냅샷)", async () => {
    const { s, topic } = await topicSession("s01", "꼭짓점");
    const q1 = await api.getQuiz(s.id, topic.topicId);
    const q2 = await api.getQuiz(s.id, topic.topicId);
    expect(q2.questions).toEqual(q1.questions);
  });

  it("정답을 고르면 모두 맞고, 미선택은 오답이다", async () => {
    const { s, topic } = await topicSession("s01", "질량 보존");
    const quiz = await api.getQuiz(s.id, topic.topicId);
    const ans = correctAnswers(quiz.questions);
    ans[quiz.questions[0].id] = null as never;
    const r = await api.submitQuiz(s.id, ans);
    expect(r.total).toBe(5);
    expect(r.correct).toBe(4);
    expect(r.topicId).toBe(topic.topicId);
  });

  it("객관식 선택지는 세션마다 섞여 나온다", async () => {
    const original = new Map(TOPIC_DICTIONARY.flatMap((d) => d.pool).map((x) => [x.prompt, x.choices.join("|")]));
    let shuffled = false;
    for (let k = 0; k < 5; k++) {
      const { s, topic } = await topicSession("s01", "꼭짓점");
      for (const q of (await api.getQuiz(s.id, topic.topicId)).questions) {
        if (q.type === "OX") expect(q.choices).toEqual(["O", "X"]);
        else if (q.choices.join("|") !== original.get(q.prompt)) shuffled = true;
      }
    }
    expect(shuffled).toBe(true);
  });

  it("신고한 문항은 채점에서 빠진다", async () => {
    const { s, topic } = await topicSession("s01", "꼭짓점");
    const quiz = await api.getQuiz(s.id, topic.topicId);
    await api.reportQuestion(s.id, quiz.questions[0].id, "WRONG_ANSWER");
    const r = await api.submitQuiz(s.id, correctAnswers(quiz.questions));
    expect(r.total).toBe(4);
    expect(r.correct).toBe(4);
    expect(r.items.find((i) => i.questionId === quiz.questions[0].id)?.reported).toBe(true);
  });

  it("전부 신고하면 채점 문항이 0개다", async () => {
    const { s, topic } = await topicSession("s01", "꼭짓점");
    const quiz = await api.getQuiz(s.id, topic.topicId);
    for (const q of quiz.questions) await api.reportQuestion(s.id, q.id, "UNCLEAR");
    const r = await api.submitQuiz(s.id, {});
    expect(r.total).toBe(0);
  });

  it("제출 뒤에는 신고할 수 없다", async () => {
    const { s, topic } = await topicSession("s01", "꼭짓점");
    const quiz = await api.getQuiz(s.id, topic.topicId);
    await api.submitQuiz(s.id, {});
    await expectCode(api.reportQuestion(s.id, quiz.questions[0].id, "WRONG_ANSWER"), "QUIZ_ALREADY_TAKEN");
  });

  it("다른 학생 세션의 퀴즈·신고는 할 수 없다", async () => {
    const { s, topic } = await topicSession("s01", "꼭짓점");
    const quiz = await api.getQuiz(s.id, topic.topicId);
    await api.login("s02");
    await expectCode(api.getQuiz(s.id, topic.topicId), "NOT_FOUND");
    await expectCode(api.reportQuestion(s.id, quiz.questions[0].id, "WRONG_ANSWER"), "NOT_FOUND");
  });

  it("같은 세션은 한 번만 제출할 수 있다", async () => {
    const { s, topic } = await topicSession("s01", "꼭짓점");
    await api.getQuiz(s.id, topic.topicId);
    await api.submitQuiz(s.id, {});
    await expectCode(api.submitQuiz(s.id, {}), "QUIZ_ALREADY_TAKEN");
  });

  it("기록 공유 미동의 학생의 결과는 교사에게 null이다", async () => {
    const { s, topic } = await topicSession("s01", "꼭짓점");
    await api.getQuiz(s.id, topic.topicId);
    await api.submitQuiz(s.id, {});
    await api.saveConsents([
      { kind: "FACEPASS", granted: true, byGuardian: false },
      { kind: "AI", granted: true, byGuardian: false },
      { kind: "LEARNING_RECORD", granted: false, byGuardian: false },
    ]);
    await api.login("t1");
    expect(await api.getQuizAttempt(s.id)).toBeNull();
  });
});

describe("자유 입력 목표", () => {
  it("활동 체크 없이 '오늘 할 것'만으로 시작할 수 있다", async () => {
    await api.login("s01");
    const ev = await api.simulateFaceAuth(DEVICE, "s01", true);
    const s = await api.startSession({ goal: { subject: "이차함수 꼭짓점 복습", activities: [] }, authEventId: ev.id });
    expect(s.goal.subject).toBe("이차함수 꼭짓점 복습");
  });

  it("'오늘 할 것'이 비어 있으면 시작할 수 없다", async () => {
    await api.login("s01");
    const ev = await api.simulateFaceAuth(DEVICE, "s01", true);
    await expectCode(api.startSession({ goal: { subject: "   ", activities: [] }, authEventId: ev.id }), "VALIDATION");
  });
});

describe("주제별 성장·신고 문제", () => {
  async function topicRun(studentId: string, content: string, opts: { correct?: boolean; reportFirst?: boolean; understanding?: 1 | 2 | 3 } = {}) {
    await api.login(studentId);
    const ev = await api.simulateFaceAuth(DEVICE, studentId, true);
    const s = await api.startSession({ goal: { subject: "공부", activities: [] }, authEventId: ev.id });
    await api.addEntry({ sessionId: s.id, kind: "MEMO", content, visibility: "TEACHER" });
    advance(60_000);
    await api.endSession(s.id, (await api.simulateFaceAuth(DEVICE, studentId, true)).id);
    const [topic] = await api.extractTopics(s.id);
    const quiz = await api.getQuiz(s.id, topic.topicId);
    if (opts.reportFirst) await api.reportQuestion(s.id, quiz.questions[0].id, "WRONG_ANSWER");
    const pool = TOPIC_DICTIONARY.flatMap((d) => d.pool);
    const answers = Object.fromEntries(
      quiz.questions.map((q) => {
        const src = pool.find((x) => x.prompt === q.prompt)!;
        return [q.id, opts.correct ? q.choices.indexOf(src.choices[src.answerIndex]) : null];
      }),
    );
    const attempt = await api.submitQuiz(s.id, answers);
    if (opts.understanding) await api.saveReflection({ sessionId: s.id, checks: [], understanding: opts.understanding, remainingQuestions: [] });
    advance(60_000);
    return { s, topic, quiz, attempt };
  }

  it("처음과 최근 정답률로 성장을 보여 준다", async () => {
    const first = await topicRun("s01", "부등식", { correct: false });
    await topicRun("s01", "부등호", { correct: true });
    const g = (await api.getTopicGrowth("s01")).topics.find((t) => t.topicId === first.topic.topicId)!;
    expect(g).toMatchObject({ attempts: 2, firstRate: 0, lastRate: 1 });
  });

  it("이해도 3인데 같은 세션 정답률이 60% 미만이면 OVERCONFIDENT", async () => {
    const r = await topicRun("s02", "관계대명사", { correct: false, understanding: 3 });
    await api.login("t1");
    const g = (await api.getTopicGrowth("s02")).topics.find((t) => t.topicId === r.topic.topicId)!;
    expect(g.signal).toBe("OVERCONFIDENT");
  });

  it("공유 미동의 학생은 교사에게 주제 없이 전체 횟수·시간만", async () => {
    await topicRun("s01", "꼭짓점", { correct: true });
    await api.saveConsents([
      { kind: "FACEPASS", granted: true, byGuardian: false },
      { kind: "AI", granted: true, byGuardian: false },
      { kind: "LEARNING_RECORD", granted: false, byGuardian: false },
    ]);
    await api.login("t1");
    const g = await api.getTopicGrowth("s01");
    expect(g.shared).toBe(false);
    expect(g.topics).toEqual([]);
    expect(g.total.sessions).toBeGreaterThan(0);
  });

  it("학생은 다른 학생 성장을 볼 수 없다", async () => {
    await api.login("s01");
    await expectCode(api.getTopicGrowth("s02"), "NOT_FOUND");
  });

  it("교사는 자기 반 신고 문제만 본다", async () => {
    await topicRun("s01", "꼭짓점", { reportFirst: true });
    await api.login("t1");
    expect((await api.listReportedQuestions("c1")).length).toBe(1);
    await api.login("t2");
    await expectCode(api.listReportedQuestions("c1"), "NOT_FOUND");
  });

  it("신고를 기각하면 그 응시를 다시 채점한다", async () => {
    const r = await topicRun("s01", "꼭짓점", { correct: true, reportFirst: true });
    expect(r.attempt.total).toBe(4);
    await api.login("t1");
    const [rep] = await api.listReportedQuestions("c1");
    await api.resolveReport(rep.reportId, "DISMISS");
    await api.login("s01");
    const after = await api.getQuizAttempt(r.s.id);
    expect(after).toMatchObject({ total: 5, correct: 5 });
  });

  it("제외를 유지하면 그 문항은 다음 출제부터 빠진다", async () => {
    const r = await topicRun("s01", "부등식", { reportFirst: true });
    const excludedId = r.quiz.questions[0].id;
    await api.login("t1");
    const [rep] = await api.listReportedQuestions("c1");
    await api.resolveReport(rep.reportId, "KEEP_EXCLUDED");
    const next = await topicRun("s02", "부등호", {});
    expect(next.quiz.questions.map((q) => q.id)).not.toContain(excludedId);
  });

  it("학생은 신고를 처리할 수 없다", async () => {
    await topicRun("s01", "꼭짓점", { reportFirst: true });
    await api.login("t1");
    const [rep] = await api.listReportedQuestions("c1");
    await api.login("s01");
    await expectCode(api.resolveReport(rep.reportId, "DISMISS"), "FORBIDDEN");
  });
});

describe("최종 리뷰 수정 (주제별 성장)", () => {
  async function run(studentId: string, content: string, opts: { answers?: "correct" | "wrong"; report?: number; understanding?: 1 | 2 | 3 } = {}) {
    await api.login(studentId);
    const ev = await api.simulateFaceAuth(DEVICE, studentId, true);
    const s = await api.startSession({ goal: { subject: "공부", activities: [] }, authEventId: ev.id });
    await api.addEntry({ sessionId: s.id, kind: "MEMO", content, visibility: "TEACHER" });
    advance(60_000);
    await api.endSession(s.id, (await api.simulateFaceAuth(DEVICE, studentId, true)).id);
    const [topic] = await api.extractTopics(s.id);
    const quiz = await api.getQuiz(s.id, topic.topicId);
    for (const q of quiz.questions.slice(0, opts.report ?? 0)) await api.reportQuestion(s.id, q.id, "WRONG_ANSWER");
    const pool = TOPIC_DICTIONARY.flatMap((d) => d.pool);
    const answers = Object.fromEntries(
      quiz.questions.map((q) => {
        const src = pool.find((x) => x.prompt === q.prompt)!;
        const right = q.choices.indexOf(src.choices[src.answerIndex]);
        return [q.id, opts.answers === "correct" ? right : opts.answers === "wrong" ? (right + 1) % q.choices.length : null];
      }),
    );
    const attempt = await api.submitQuiz(s.id, answers);
    if (opts.understanding) await api.saveReflection({ sessionId: s.id, checks: [], understanding: opts.understanding, remainingQuestions: [] });
    advance(60_000);
    return { s, topic, quiz, attempt };
  }

  it("AI 동의가 없으면 기록을 AI로 보내는 주제 추출을 하지 않는다", async () => {
    await api.login("s04"); // 시드: AI 거부
    const ev = await api.simulateFaceAuth(DEVICE, "s04", true);
    const s = await api.startSession({ goal: { subject: "공부", activities: [] }, authEventId: ev.id });
    await api.addEntry({ sessionId: s.id, kind: "MEMO", content: "꼭짓점", visibility: "TEACHER" });
    advance(60_000);
    await api.endSession(s.id, (await api.simulateFaceAuth(DEVICE, "s04", true)).id);
    await expectCode(api.extractTopics(s.id), "CONSENT_REQUIRED");
  });

  it("문항 제외를 유지하면 그 문항을 푼 다른 학생 응시도 다시 채점한다", async () => {
    const a = await run("s01", "부등식", { answers: "correct", report: 1 });
    const b = await run("s02", "부등호", { answers: "correct" });
    expect(b.attempt.total).toBe(5);
    await api.login("t1");
    const rep = (await api.listReportedQuestions("c1")).find((r) => r.prompt === a.quiz.questions[0].prompt)!;
    await api.resolveReport(rep.reportId, "KEEP_EXCLUDED");
    await api.login("s02");
    expect((await api.getQuizAttempt(b.s.id))?.total).toBe(4);
  });

  it("채점 문항이 3개 미만이면 차이 신호를 내지 않는다", async () => {
    const r = await run("s02", "관계대명사", { answers: "wrong", report: 3, understanding: 3 });
    await api.login("t1");
    const g = (await api.getTopicGrowth("s02")).topics.find((t) => t.topicId === r.topic.topicId)!;
    expect(g.lastTotal).toBe(2);
    expect(g.signal).toBeNull();
  });

  it("기록 공유 미동의 학생의 신고는 교사에게 학생 번호 없이 보인다", async () => {
    await run("s01", "꼭짓점", { report: 1 });
    await api.login("s01");
    await api.saveConsents([
      { kind: "FACEPASS", granted: true, byGuardian: false },
      { kind: "AI", granted: true, byGuardian: false },
      { kind: "LEARNING_RECORD", granted: false, byGuardian: false },
    ]);
    await api.login("t1");
    const [rep] = await api.listReportedQuestions("c1");
    expect(rep.studentNumber).toBeNull();
    expect(rep.studentReportCount).toBeNull();
  });
});

describe("미룬 항목 수정", () => {
  async function topicQuiz(studentId: string, content: string) {
    await api.login(studentId);
    const ev = await api.simulateFaceAuth(DEVICE, studentId, true);
    const s = await api.startSession({ goal: { subject: "공부", activities: [] }, authEventId: ev.id });
    await api.addEntry({ sessionId: s.id, kind: "MEMO", content, visibility: "TEACHER" });
    advance(60_000);
    await api.endSession(s.id, (await api.simulateFaceAuth(DEVICE, studentId, true)).id);
    const [topic] = await api.extractTopics(s.id);
    const quiz = await api.getQuiz(s.id, topic.topicId);
    advance(60_000);
    return { s, topic, quiz };
  }

  describe("신고 AI 1차 검토", () => {
    let reviews: number;
    const withReviewer = (verdict: "OK" | "ERROR") => {
      reviews = 0;
      api = createMockApi({
        seed: createSeed(clock),
        now: () => clock,
        latencyMs: 0,
        storage: null,
        reviewQuestion: () => {
          reviews += 1;
          return { verdict, reason: verdict === "OK" ? "정답과 해설이 맞아요" : "정답 번호가 해설과 달라요" };
        },
      });
    };
    const teacherRows = async () => {
      await api.login("t1");
      return api.listReportedQuestions("c1");
    };

    it("첫 신고를 AI가 문제 없다고 보면 채점에 포함하고, 교사 목록엔 AI_CLEARED로만 남는다", async () => {
      withReviewer("OK");
      const { s, quiz } = await topicQuiz("s07", "꼭짓점");
      const out = await api.reportQuestion(s.id, quiz.questions[0].id, "WRONG_ANSWER");
      expect(out.review).toBe("AI_OK");
      expect(out.message).not.toBe("");
      expect((await api.submitQuiz(s.id, {})).total).toBe(5);
      const rows = await teacherRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ status: "AI_CLEARED", aiReview: { verdict: "OK" }, questionReportCount: 1, studentReportCount: 1 });
    });

    it("AI가 오류로 보면 채점에서 빼고 교사 확인 목록에 올린다", async () => {
      withReviewer("ERROR");
      const { s, quiz } = await topicQuiz("s07", "꼭짓점");
      expect((await api.reportQuestion(s.id, quiz.questions[0].id, "WRONG_ANSWER")).review).toBe("AI_ERROR");
      expect((await api.submitQuiz(s.id, {})).total).toBe(4);
      expect((await teacherRows())[0]).toMatchObject({ status: "OPEN", aiReview: { verdict: "ERROR" } });
    });

    it("같은 문항이 다시 신고되면 AI를 거치지 않고 교사에게, 앞선 AI 검토와 신고 수를 함께 보인다", async () => {
      withReviewer("OK");
      const a = await topicQuiz("s01", "꼭짓점");
      const b = await topicQuiz("s02", "꼭짓점");
      const common = a.quiz.questions.find((q) => b.quiz.questions.some((x) => x.id === q.id));
      expect(common).toBeDefined();
      await api.login("s01");
      expect((await api.reportQuestion(a.s.id, common!.id, "UNCLEAR")).review).toBe("AI_OK");
      await api.login("s02");
      expect((await api.reportQuestion(b.s.id, common!.id, "UNCLEAR")).review).toBe("TO_TEACHER");
      expect(reviews).toBe(1);
      expect((await api.submitQuiz(b.s.id, {})).total).toBe(4);
      const rows = await teacherRows();
      const open = rows.find((r) => r.status === "OPEN")!;
      expect(open).toMatchObject({ aiReview: { verdict: "OK" }, questionReportCount: 2 });
      expect(rows.filter((r) => r.status === "AI_CLEARED")).toHaveLength(1);
    });

    it("새로 불러와도 AI가 문제 없다고 본 신고 결과가 출제 문항에 남는다", async () => {
      withReviewer("OK");
      const { s, topic, quiz } = await topicQuiz("s07", "꼭짓점");
      await api.reportQuestion(s.id, quiz.questions[0].id, "UNCLEAR");
      const again = await api.getQuiz(s.id, topic.topicId);
      expect(again.questions[0].reportOutcome?.review).toBe("AI_OK");
      expect(again.questions[0].reported).toBe(false);
      expect(again.questions[1].reportOutcome).toBeUndefined();
    });

    it("AI가 걸러 낸 신고와 이미 처리한 신고는 교사가 다시 처리할 수 없다", async () => {
      withReviewer("OK");
      const { s, quiz } = await topicQuiz("s07", "꼭짓점");
      await api.reportQuestion(s.id, quiz.questions[0].id, "UNCLEAR");
      const [cleared] = await teacherRows();
      await expectCode(api.resolveReport(cleared.reportId, "KEEP_EXCLUDED"), "VALIDATION");
      withReviewer("ERROR");
      const b = await topicQuiz("s07", "꼭짓점");
      await api.reportQuestion(b.s.id, b.quiz.questions[0].id, "UNCLEAR");
      const [open] = await teacherRows();
      await api.resolveReport(open.reportId, "DISMISS");
      await expectCode(api.resolveReport(open.reportId, "KEEP_EXCLUDED"), "VALIDATION");
    });

    it("같은 문항의 열린 신고는 교사 결정 한 번으로 함께 처리하고 각 응시를 재채점한다", async () => {
      withReviewer("ERROR");
      const a = await topicQuiz("s01", "꼭짓점");
      const b = await topicQuiz("s02", "꼭짓점");
      const common = a.quiz.questions.find((q) => b.quiz.questions.some((x) => x.id === q.id))!;
      await api.login("s01");
      await api.reportQuestion(a.s.id, common.id, "UNCLEAR");
      await api.submitQuiz(a.s.id, {});
      await api.login("s02");
      expect((await api.reportQuestion(b.s.id, common.id, "UNCLEAR")).review).toBe("TO_TEACHER");
      await api.submitQuiz(b.s.id, {});
      const rows = await teacherRows();
      expect(rows.filter((r) => r.status === "OPEN")).toHaveLength(2);
      await api.resolveReport(rows[0].reportId, "DISMISS");
      expect((await teacherRows()).map((r) => r.status)).toEqual(["DISMISSED", "DISMISSED"]);
      expect((await api.getQuizAttempt(a.s.id))!.total).toBe(5);
      expect((await api.getQuizAttempt(b.s.id))!.total).toBe(5);
    });

    it("기본 mock AI 검토는 형식이 맞는 시드 문항을 문제 없다고 본다", async () => {
      api = createMockApi({ seed: createSeed(clock), now: () => clock, latencyMs: 0, storage: null });
      const { s, quiz } = await topicQuiz("s07", "꼭짓점");
      expect((await api.reportQuestion(s.id, quiz.questions[0].id, "WRONG_ANSWER")).review).toBe("AI_OK");
    });

    it("같은 학생이 같은 문항을 다시 신고하면 같은 결과를 돌려주고 한 번으로 센다", async () => {
      withReviewer("OK");
      const { s, quiz } = await topicQuiz("s07", "꼭짓점");
      const first = await api.reportQuestion(s.id, quiz.questions[0].id, "UNCLEAR");
      const again = await api.reportQuestion(s.id, quiz.questions[0].id, "WRONG_ANSWER");
      expect(again).toEqual(first);
      expect(reviews).toBe(1);
      await api.reportQuestion(s.id, quiz.questions[1].id, "UNCLEAR");
      const rows = await teacherRows();
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.studentReportCount === 2)).toBe(true);
    });
  });

  it("새로 불러와도 신고한 문항은 신고 상태로 나온다", async () => {
    const { s, topic, quiz } = await topicQuiz("s01", "꼭짓점");
    await api.reportQuestion(s.id, quiz.questions[0].id, "UNCLEAR");
    const again = await api.getQuiz(s.id, topic.topicId);
    expect(again.questions[0].reported).toBe(true);
    expect(again.questions[1].reported).toBe(false);
  });

  it("같은 주제는 풀이 5문항보다 커도 모두 같은 반 풀에서, 개념 3·적용 2로 나온다", async () => {
    const pool = TOPIC_DICTIONARY.find((d) => d.name === "이차함수 꼭짓점")!.pool;
    for (const sid of ["s01", "s02"]) {
      const { quiz } = await topicQuiz(sid, "꼭짓점");
      const levels = quiz.questions.map((q) => pool.find((x) => x.prompt === q.prompt)?.level);
      expect(levels.every(Boolean)).toBe(true);
      expect(levels.filter((l) => l === "CONCEPT").length).toBe(3);
      expect(levels.filter((l) => l === "APPLY").length).toBe(2);
    }
  });

  it("전부 신고한 응시는 성장·대시보드 정답률에 들어가지 않는다", async () => {
    const { s, quiz } = await topicQuiz("s07", "꼭짓점"); // 시드에 응시 기록 없는 학생
    await api.login("s07");
    for (const q of quiz.questions) await api.reportQuestion(s.id, q.id, "UNCLEAR");
    await api.submitQuiz(s.id, {});
    const g = await api.getTopicGrowth("s07");
    expect(g.topics[0].lastRate).toBeNull();
    await api.login("t1");
    expect((await api.getDashboard("c1")).students.find((x) => x.studentId === "s07")!.lastQuizRate).toBeNull();
  });

  const noReflectionApi = () => {
    const seed = createSeed(clock);
    seed.reflections = []; // 시드 돌아보기를 비워 다른 기록 때문에 플래그가 켜져 있지 않게 한다
    return createMockApi({ seed, now: () => clock, latencyMs: 0, storage: null });
  };
  const s07Flag = async () => (await api.getDashboard("c1")).students.find((x) => x.studentId === "s07")!.hasReflectionWithoutFeedback;
  async function endWithReflection(studentId: string) {
    const s = await startAs(studentId);
    advance(60_000);
    await api.endSession(s.id, (await api.simulateFaceAuth(DEVICE, studentId, true)).id);
    await api.saveReflection({ sessionId: s.id, checks: [], understanding: 2, remainingQuestions: [] });
    return s;
  }

  it("돌아보기에 피드백이 없으면 '피드백 기다림', 피드백을 보내거나 공유를 철회하면 해제", async () => {
    api = noReflectionApi();
    const flag = s07Flag;
    await api.login("t1");
    expect(await flag()).toBe(false);
    const s = await startAs("s07");
    advance(60_000);
    await api.endSession(s.id, (await api.simulateFaceAuth(DEVICE, "s07", true)).id);
    await api.saveReflection({ sessionId: s.id, checks: [], understanding: 2, remainingQuestions: [] });
    await api.login("t1");
    expect(await flag()).toBe(true);
    await api.addFeedback(s.id, "잘했어요");
    expect(await flag()).toBe(false);
    await api.login("s07");
    const s2 = await api.startSession({ goal: GOAL, authEventId: (await api.simulateFaceAuth(DEVICE, "s07", true)).id });
    advance(60_000);
    await api.endSession(s2.id, (await api.simulateFaceAuth(DEVICE, "s07", true)).id);
    await api.saveReflection({ sessionId: s2.id, checks: [], understanding: 3, remainingQuestions: [] });
    await api.saveConsents([
      { kind: "FACEPASS", granted: true, byGuardian: false },
      { kind: "AI", granted: true, byGuardian: false },
      { kind: "LEARNING_RECORD", granted: false, byGuardian: false },
    ]);
    await api.login("t1");
    expect(await flag()).toBe(false);
  });

  it("'피드백 기다림'은 최근 7일 안의 돌아보기만 센다", async () => {
    api = noReflectionApi();
    await endWithReflection("s07");
    advance(6 * 86400000);
    await api.login("t1");
    expect(await s07Flag()).toBe(true);
    advance(2 * 86400000);
    expect(await s07Flag()).toBe(false);
  });

  it("기록 공유를 철회하면 대시보드 최근 테스트 정답률도 숨긴다", async () => {
    const { s } = await topicQuiz("s07", "꼭짓점");
    await api.login("s07");
    await api.submitQuiz(s.id, {});
    await api.saveConsents([
      { kind: "FACEPASS", granted: true, byGuardian: false },
      { kind: "AI", granted: true, byGuardian: false },
      { kind: "LEARNING_RECORD", granted: false, byGuardian: false },
    ]);
    await api.login("t1");
    expect((await api.getDashboard("c1")).students.find((x) => x.studentId === "s07")!.lastQuizRate).toBeNull();
  });

  it("진행 중인 세션은 교사가 평가를 확정할 수 없다", async () => {
    await api.login("s01");
    const ev = await api.simulateFaceAuth(DEVICE, "s01", true);
    const s = await api.startSession({ goal: GOAL, authEventId: ev.id });
    await api.login("t1");
    await expectCode(api.finalizeAssessment(s.id, []), "SESSION_NOT_ACTIVE");
  });
});

describe("반 분석 원자료", () => {
  const FOUR_WEEKS = 28 * 86400000;
  const range = () => [new Date(clock.getTime() - FOUR_WEEKS), clock] as const;

  it("반 분석: 교사는 자기 반 학생 30명과 시드 질문을 받는다", async () => {
    await api.login("t1");
    const r = await api.getClassAnalytics("c1", ...range());
    expect(r.students.length).toBe(30);
    expect(r.sessions.length).toBeGreaterThan(0);
    expect(r.questions.length).toBeGreaterThan(0);
    expect(r.questions.every((q) => r.sessions.some((s) => s.id === q.sessionId && s.studentId === q.studentId))).toBe(true);
  });

  it("반 분석: 기간 밖 세션은 빠진다", async () => {
    await api.login("t1");
    const r = await api.getClassAnalytics("c1", new Date(clock.getTime() + 86400000), new Date(clock.getTime() + 2 * 86400000));
    expect(r.sessions).toEqual([]);
    expect(r.questions).toEqual([]);
  });

  it("반 분석: 기록 공유 미동의 학생은 shared=false, 질문·응시·주제가 빠진다", async () => {
    await api.login("s05");
    await api.saveConsents([
      { kind: "FACEPASS", granted: true, byGuardian: false },
      { kind: "AI", granted: true, byGuardian: false },
      { kind: "LEARNING_RECORD", granted: false, byGuardian: false },
    ]);
    await api.login("t1");
    const r = await api.getClassAnalytics("c1", ...range());
    expect(r.students.find((s) => s.studentId === "s05")?.shared).toBe(false);
    expect(r.questions.some((q) => q.studentId === "s05")).toBe(false);
    expect(r.attempts.some((a) => a.studentId === "s05")).toBe(false);
    const s05Sessions = new Set(r.sessions.filter((s) => s.studentId === "s05").map((s) => s.id));
    expect(r.sessionTopics.some((t) => s05Sessions.has(t.sessionId))).toBe(false);
  });

  it("반 분석: 다른 반 교사는 NOT_FOUND, 학생은 FORBIDDEN", async () => {
    await api.login("t2");
    await expectCode(api.getClassAnalytics("c1", ...range()), "NOT_FOUND");
    await api.login("s01");
    await expectCode(api.getClassAnalytics("c1", ...range()), "FORBIDDEN");
  });
});

describe("피드백 읽음·교사 열람 기록", () => {
  async function feedbackFor(studentId: string) {
    await api.login("t1");
    const ss = await api.listSessions({ studentId });
    return api.addFeedback(ss[0].id, "잘했어요");
  }

  it("학생이 자기 피드백을 읽음으로 하면 readAt이 생긴다", async () => {
    const f = await feedbackFor("s02");
    expect(f.readAt).toBeNull();
    await api.login("s02");
    await api.markFeedbackRead(f.id);
    expect((await api.listFeedback(f.sessionId)).find((x) => x.id === f.id)?.readAt).not.toBeNull();
  });

  it("남의 피드백·교사의 읽음 요청은 조용히 무시된다 (실제 서버는 0건 처리)", async () => {
    const f = await feedbackFor("s02");
    await api.login("s01");
    await api.markFeedbackRead(f.id);
    await api.login("t1");
    await api.markFeedbackRead(f.id);
    expect((await api.listFeedback(f.sessionId)).find((x) => x.id === f.id)?.readAt).toBeNull();
  });

  it("교사가 학생 상세를 열면 그 학생의 열람 기록에 남는다", async () => {
    await api.login("t1");
    await api.logStudentView("s02");
    await api.login("s02");
    const logs = await api.listAuditLogs();
    expect(logs.length).toBe(1);
    expect(logs[0]).toMatchObject({ action: "VIEW_STUDENT_DETAIL", actorName: "한담임", studentId: "s02" });
    await api.login("s01");
    expect(await api.listAuditLogs()).toEqual([]);
  });

  it("다른 반 학생 열람 기록은 남길 수 없다", async () => {
    await api.login("t2");
    await expectCode(api.logStudentView("s02"), "NOT_FOUND");
  });
});

describe("열람 기록 개수", () => {
  it("최근 10개까지만 돌려준다", async () => {
    await api.login("t1");
    for (let i = 0; i < 12; i++) await api.logStudentView("s02");
    await api.login("s02");
    expect((await api.listAuditLogs()).length).toBe(10);
  });
});


describe("mock 오류 강제 (화면 확인용)", () => {
  function memoryStorage(): Storage {
    const m = new Map<string, string>();
    return {
      get length() { return m.size; },
      clear: () => m.clear(),
      getItem: (k) => m.get(k) ?? null,
      key: (i) => [...m.keys()][i] ?? null,
      removeItem: (k) => void m.delete(k),
      setItem: (k, v) => void m.set(k, String(v)),
    };
  }

  it("키에 넣은 오류로 다음 AI 호출 한 번만 실패하고 키는 지워진다", async () => {
    const storage = memoryStorage();
    api = createMockApi({ seed: createSeed(clock), now: () => clock, latencyMs: 0, storage });
    const s = await startAs("s01");
    storage.setItem(MOCK_FAIL_KEY, "AI_TIMEOUT");
    await expectCode(api.askAi(s.id, "꼭짓점이 뭐야?"), "AI_TIMEOUT");
    expect(storage.getItem(MOCK_FAIL_KEY)).toBeNull();
    expect((await api.askAi(s.id, "꼭짓점이 뭐야?")).role).toBe("ai");
  });

  it("늦추기 키는 다음 출제 한 번에만 쓰이고 지워진다", async () => {
    const storage = memoryStorage();
    api = createMockApi({ seed: createSeed(clock), now: () => clock, latencyMs: 0, storage });
    await api.login("s01");
    const ev = await api.simulateFaceAuth(DEVICE, "s01", true);
    const s = await api.startSession({ goal: { subject: "공부", activities: [] }, authEventId: ev.id });
    await api.addEntry({ sessionId: s.id, kind: "MEMO", content: "꼭짓점", visibility: "TEACHER" });
    advance(60_000);
    await api.endSession(s.id, (await api.simulateFaceAuth(DEVICE, "s01", true)).id);
    const [topic] = await api.extractTopics(s.id);
    storage.setItem(MOCK_SLOW_KEY, "5");
    expect((await api.getQuiz(s.id, topic.topicId)).questions).toHaveLength(5);
    expect(storage.getItem(MOCK_SLOW_KEY)).toBeNull();
  });

  it("모르는 값은 무시한다", async () => {
    const storage = memoryStorage();
    api = createMockApi({ seed: createSeed(clock), now: () => clock, latencyMs: 0, storage });
    const s = await startAs("s01");
    storage.setItem(MOCK_FAIL_KEY, "FORBIDDEN");
    expect((await api.askAi(s.id, "꼭짓점이 뭐야?")).role).toBe("ai");
  });
});

describe("Pace 지수 원자료", () => {
  async function endedWith(studentId: string) {
    const s = await startAs(studentId);
    await api.addEntry({ sessionId: s.id, kind: "MEMO", content: "공개 메모 열 글자 이상이에요", visibility: "TEACHER" });
    await api.addEntry({ sessionId: s.id, kind: "QUESTION", content: "나만 볼 질문 열 글자 이상이에요", visibility: "PRIVATE" });
    advance(60_000);
    await api.endSession(s.id, (await api.simulateFaceAuth(DEVICE, studentId, true)).id);
    await api.saveReflection({ sessionId: s.id, checks: ["goal_done"], understanding: 2, remainingQuestions: [] });
    return s;
  }

  it("학생 본인은 자기 세션·공개 기록·돌아보기를 받고, '나만 보기' 메모·질문은 받지 않는다", async () => {
    const s = await endedWith("s01");
    const r = await api.getPaceInputs("s01");
    expect(r.shared).toBe(true);
    expect(r.sessions.every((x) => x.studentId === "s01")).toBe(true);
    expect(r.sessions.some((x) => x.id === s.id)).toBe(true);
    expect(r.entries.some((e) => e.content === "공개 메모 열 글자 이상이에요")).toBe(true);
    expect(r.entries.some((e) => e.visibility === "PRIVATE" && e.kind !== "PAPER")).toBe(false);
    expect(r.reflections.some((x) => x.sessionId === s.id)).toBe(true);
  });

  it("학생은 다른 학생 것을, 다른 반 교사는 남의 반 학생 것을 받을 수 없다", async () => {
    await api.login("s01");
    await expectCode(api.getPaceInputs("s02"), "NOT_FOUND");
    await api.login("t2");
    await expectCode(api.getPaceInputs("s01"), "NOT_FOUND");
  });

  it("같은 반 교사는 공개 기록만 받는다", async () => {
    await endedWith("s01");
    await api.login("t1");
    const r = await api.getPaceInputs("s01");
    expect(r.shared).toBe(true);
    expect(r.sessions.length).toBeGreaterThan(0);
    expect(r.entries.every((e) => e.visibility === "TEACHER")).toBe(true);
    expect(r.entries.some((e) => e.content.startsWith("나만 볼"))).toBe(false);
  });

  it("'나만 보기' 종이 기록은 점수에 넣지 않고 교사에게 보내지도 않는다 (개수도 드러나지 않게)", async () => {
    const s = await startAs("s01");
    await api.addEntry({ sessionId: s.id, kind: "PAPER", content: "종이에 쓴 비밀 내용", visibility: "PRIVATE" });
    await api.login("t1");
    const paper = (await api.getPaceInputs("s01")).entries.filter((e) => e.sessionId === s.id && e.kind === "PAPER");
    expect(paper).toHaveLength(0);
  });

  it("기록 공유 미동의 학생을 교사가 보면 shared=false, 배열은 빈 값", async () => {
    await endedWith("s01");
    await api.saveConsents([
      { kind: "FACEPASS", granted: true, byGuardian: false },
      { kind: "AI", granted: true, byGuardian: false },
      { kind: "LEARNING_RECORD", granted: false, byGuardian: false },
    ]);
    await api.login("t1");
    expect(await api.getPaceInputs("s01")).toEqual({ shared: false, sessions: [], entries: [], reflections: [], attempts: [] });
  });
});

describe("종이 사진 글자 인식 (mock)", () => {
  const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

  it("본인 진행 중 학습이면 예시 글자를 돌려준다", async () => {
    const s = await startAs("s01");
    const r = await api.ocrPaperPhoto(s.id, JPEG);
    expect(r.text).toContain("꼭짓점");
  });

  it("AI 동의가 없으면 CONSENT_REQUIRED", async () => {
    const s = await startAs("s04");
    await expectCode(api.ocrPaperPhoto(s.id, JPEG), "CONSENT_REQUIRED");
  });

  it("다른 사람의 학습이면 NOT_FOUND (서버 404와 같게)", async () => {
    const s = await startAs("s01");
    await api.login("t1");
    await expectCode(api.ocrPaperPhoto(s.id, JPEG), "NOT_FOUND");
  });

  it("JPEG·PNG data URL이 아니면 VALIDATION", async () => {
    const s = await startAs("s01");
    await expectCode(api.ocrPaperPhoto(s.id, "data:image/gif;base64,R0lGOD=="), "VALIDATION");
    await expectCode(api.ocrPaperPhoto(s.id, "https://example.com/a.jpg"), "VALIDATION");
  });

  it("디코딩 크기가 2MB를 넘으면 VALIDATION, 2MB까지는 통과", async () => {
    const s = await startAs("s01");
    const MB2 = 2 * 1024 * 1024;
    // base64 4글자 = 3바이트. 2MB = 3 × 699050 + 2 → 699051묶음(2796204글자), 마지막 묶음은 '=' 하나 → 정확히 2,097,152바이트
    const b64Bytes = (b: string) => (b.length / 4) * 3 - (b.endsWith("==") ? 2 : b.endsWith("=") ? 1 : 0);
    const atLimitB64 = "A".repeat(Math.ceil(MB2 / 3) * 4 - 1) + "=";
    const overB64 = "A".repeat(((MB2 + 1) / 3) * 4); // 2MB + 1 = 3 × 699051, 패딩 없음
    expect(b64Bytes(atLimitB64)).toBe(MB2);
    expect(b64Bytes(overB64)).toBe(MB2 + 1);
    const atLimit = "data:image/png;base64," + atLimitB64;
    const over = "data:image/png;base64," + overB64;
    expect((await api.ocrPaperPhoto(s.id, atLimit)).text).not.toBe("");
    await expectCode(api.ocrPaperPhoto(s.id, over), "VALIDATION");
  });

  it("끝난 학습이면 SESSION_NOT_ACTIVE", async () => {
    const s = await startAs("s01");
    advance(60_000);
    await api.endSession(s.id, (await api.simulateFaceAuth(DEVICE, "s01", true)).id);
    await expectCode(api.ocrPaperPhoto(s.id, JPEG), "SESSION_NOT_ACTIVE");
  });

  it("오류 강제 키로 AI 실패 화면을 볼 수 있다", async () => {
    const m = new Map<string, string>();
    const storage = {
      get length() { return m.size; },
      clear: () => m.clear(),
      getItem: (k: string) => m.get(k) ?? null,
      key: (i: number) => [...m.keys()][i] ?? null,
      removeItem: (k: string) => void m.delete(k),
      setItem: (k: string, v: string) => void m.set(k, String(v)),
    } as Storage;
    api = createMockApi({ seed: createSeed(clock), now: () => clock, latencyMs: 0, storage });
    const s = await startAs("s01");
    storage.setItem(MOCK_FAIL_KEY, "AI_BAD_OUTPUT");
    await expectCode(api.ocrPaperPhoto(s.id, JPEG), "AI_BAD_OUTPUT");
  });

  it("AI 호출 제한(분당)에 같이 걸린다", async () => {
    const s = await startAs("s01");
    let limited = false;
    for (let i = 0; i < 30 && !limited; i++) {
      try {
        await api.ocrPaperPhoto(s.id, JPEG);
      } catch (e) {
        limited = e instanceof ApiError && e.code === "RATE_LIMITED";
      }
    }
    expect(limited).toBe(true);
  });
});

describe("교과 교사", () => {
  function setConsents(studentId: string, c: { learningRecord: boolean; subjectShare: boolean }) {
    return api.login(studentId).then(() =>
      api.saveConsents([
        { kind: "FACEPASS", granted: true, byGuardian: false },
        { kind: "AI", granted: true, byGuardian: false },
        { kind: "LEARNING_RECORD", granted: c.learningRecord, byGuardian: false },
        { kind: "SUBJECT_SHARE", granted: c.subjectShare, byGuardian: false },
      ]),
    );
  }

  it("교과 교사는 맡은 과목 세션만 본다", async () => {
    await api.login("t3");
    const math = await api.listSessions({ studentId: "s01", subject: "수학" });
    expect(math.length).toBeGreaterThan(0);
    expect(math.every((s) => s.goal.subject === "수학" && s.studentId === "s01")).toBe(true);
    expect(await api.listSessions({ studentId: "s01", subject: "국어" })).toEqual([]);
    expect(await api.listSessions({ studentId: "s01", subject: "기타" })).toEqual([]);
  });

  it("교과 교사는 다른 과목 세션을 getSession으로 못 본다(NOT_FOUND)", async () => {
    await api.login("s01");
    const all = await api.listSessions({});
    const math = all.find((s) => s.goal.subject === "수학")!;
    const korean = all.find((s) => s.goal.subject === "국어")!;
    await api.login("t3");
    expect((await api.getSession(math.id)).id).toBe(math.id);
    await expectCode(api.getSession(korean.id), "NOT_FOUND");
    expect(await api.listEntries(korean.id).catch((e: ApiError) => e.code)).toBe("NOT_FOUND");
    expect(await api.getReflection(korean.id).catch((e: ApiError) => e.code)).toBe("NOT_FOUND");
    expect(await api.listFeedback(korean.id).catch((e: ApiError) => e.code)).toBe("NOT_FOUND");
    expect(await api.getQuizAttempt(korean.id).catch((e: ApiError) => e.code)).toBe("NOT_FOUND");
  });

  it("교과 교사는 다른 반 학생 세션을 못 본다", async () => {
    await api.login("s01");
    const math = (await api.listSessions({})).find((s) => s.goal.subject === "수학")!;
    // 오선생(t2): c2 담임, 교과 배정 없음
    await api.login("t2");
    expect(await api.listSessions({ studentId: "s01", subject: "수학" })).toEqual([]);
    await expectCode(api.getSession(math.id), "NOT_FOUND");
    await expectCode(api.logStudentView("s01", "수학"), "NOT_FOUND");
    await expectCode(api.listSubjectStudents("c1", "수학"), "NOT_FOUND");
    await expectCode(api.getSubjectSummary("c1", "수학"), "NOT_FOUND");
    // 반 classId ""로 담임 경로를 흉내 내도 안 열린다
    await api.login("t3");
    await expectCode(api.listStudents(""), "NOT_FOUND");
    await expectCode(api.getDashboard(""), "NOT_FOUND");
  });

  it("SUBJECT_SHARE 미동의 학생은 목록·집계에 없다", async () => {
    // 이나래(s02): 교과 공유 동의 없음, 이번 주 수학 학습 1개
    const s = await startAs("s02");
    advance(60_000);
    await api.endSession(s.id, (await api.simulateFaceAuth(DEVICE, "s02", true)).id);
    await api.login("t3");
    const students = await api.listSubjectStudents("c1", "수학");
    expect(students.some((x) => x.id === "s01")).toBe(true);
    expect(students.some((x) => x.id === "s02")).toBe(false);
    expect(students.map((x) => x.number)).toEqual([...students.map((x) => x.number)].sort((a, b) => a - b));
    expect(await api.listSessions({ studentId: "s02", subject: "수학" })).toEqual([]);
    await expectCode(api.getSession(s.id), "NOT_FOUND");
    const before = await api.getSubjectSummary("c1", "수학");
    expect(typeof before.studentCount).toBe("number");
    expect(before.studentCount).toBeGreaterThan(2);
    await setConsents("s02", { learningRecord: true, subjectShare: true });
    await api.login("t3");
    const after = await api.getSubjectSummary("c1", "수학");
    expect(after.studentCount).toBe((before.studentCount as number) + 1);
    expect((await api.listSubjectStudents("c1", "수학")).some((x) => x.id === "s02")).toBe(true);
  });

  it("LEARNING_RECORD를 끄면 SUBJECT_SHARE가 있어도 교과 교사에게 안 보인다", async () => {
    await api.login("s01");
    const math = (await api.listSessions({})).find((s) => s.goal.subject === "수학")!;
    await setConsents("s01", { learningRecord: false, subjectShare: true });
    await api.login("t3");
    expect(await api.listSessions({ studentId: "s01", subject: "수학" })).toEqual([]);
    await expectCode(api.getSession(math.id), "NOT_FOUND");
    await expectCode(api.listEntries(math.id), "NOT_FOUND");
    expect((await api.listSubjectStudents("c1", "수학")).some((x) => x.id === "s01")).toBe(false);
    await expectCode(api.logStudentView("s01", "수학"), "NOT_FOUND");
  });

  it("PRIVATE 기록은 교과 교사에게 안 보인다", async () => {
    const s = await startAs("s01");
    await api.addEntry({ sessionId: s.id, kind: "MEMO", content: "공개 수학", visibility: "TEACHER" });
    await api.addEntry({ sessionId: s.id, kind: "MEMO", content: "비공개 수학", visibility: "PRIVATE" });
    await api.askAi(s.id, "꼭짓점이 뭐야?");
    await api.login("t3");
    const entries = await api.listEntries(s.id);
    expect(entries.map((e) => e.content)).toEqual(["공개 수학"]);
    const summary = await api.summarizeSession(s.id);
    expect(JSON.stringify(summary)).not.toContain("비공개");
    // AI 대화는 기록(TEACHER 공개분)이 아니므로 교과 교사에게 내려보내지 않는다
    expect(await api.listAiMessages(s.id)).toEqual([]);
  });

  it("담임 겸 교과 교사는 자기 반 전체·다른 반 과목만", async () => {
    await api.login("s99");
    const own99 = await api.listSessions({});
    const k99 = own99.find((s) => s.goal.subject === "국어")!;
    const m99 = own99.find((s) => s.goal.subject === "수학")!;
    // 한담임(t1): c1 담임 + c2 국어
    await api.login("t1");
    expect(await api.listMyAssignments()).toEqual([{ teacherId: "t1", classId: "c2", subject: "국어", term: "2026-2" }]);
    const c1All = await api.listSessions({ studentId: "s01" });
    expect(new Set(c1All.map((s) => s.goal.subject)).size).toBeGreaterThan(1);
    const korean = await api.listSessions({ studentId: "s99", subject: "국어" });
    expect(korean.map((s) => s.id)).toEqual([k99.id]);
    expect(await api.listSessions({ studentId: "s99", subject: "수학" })).toEqual([]);
    await expectCode(api.listSessions({ studentId: "s99" }), "NOT_FOUND");
    await expectCode(api.getSession(m99.id), "NOT_FOUND");
    expect((await api.listEntries(k99.id)).every((e) => e.visibility === "TEACHER")).toBe(true);
    expect(await api.listAiMessages(k99.id)).toEqual([]);
    expect(await api.getAssessment(k99.id)).toBeNull();
    await expectCode(api.requestAiAssessment(k99.id), "FORBIDDEN");
    await expectCode(api.getTopicGrowth("s99"), "NOT_FOUND");
    await expectCode(api.getPaceInputs("s99"), "NOT_FOUND");
    await expectCode(api.getDashboard("c2"), "NOT_FOUND");
    await expectCode(api.listStudents("c2"), "NOT_FOUND");
    await expectCode(api.listSubjectStudents("c2", "수학"), "NOT_FOUND");
    expect((await api.listSubjectStudents("c2", "국어")).map((x) => x.id)).toEqual(["s99"]);
  });

  it("교과 교사 피드백에 authorSubject가 붙고 담임·학생이 본다", async () => {
    await api.login("s01");
    const math = (await api.listSessions({})).find((s) => s.goal.subject === "수학")!;
    await api.login("t3");
    const f = await api.addFeedback(math.id, "꼭짓점 정리 좋아요");
    expect(f.authorSubject).toBe("수학");
    await api.login("t1");
    const byHomeroom = await api.addFeedback(math.id, "담임 확인");
    expect(byHomeroom.authorSubject).toBeNull();
    expect((await api.listFeedback(math.id)).find((x) => x.id === f.id)?.authorSubject).toBe("수학");
    await api.login("s01");
    const seen = await api.listFeedback(math.id);
    expect(seen.find((x) => x.id === f.id)?.authorSubject).toBe("수학");
    expect(seen.find((x) => x.id === byHomeroom.id)?.authorSubject).toBeNull();
  });

  it("교과 교사 열람 기록에 subject가 남는다", async () => {
    await api.login("t3");
    await api.logStudentView("s01", "수학");
    await expectCode(api.logStudentView("s01"), "NOT_FOUND");
    await expectCode(api.logStudentView("s01", "국어"), "NOT_FOUND");
    await expectCode(api.logStudentView("s02", "수학"), "NOT_FOUND");
    expect((await api.listAuditLogs())[0]).toMatchObject({ action: "VIEW_STUDENT_DETAIL", studentId: "s01", subject: "수학" });
    await api.login("t1");
    await api.logStudentView("s01");
    await api.login("s01");
    const logs = await api.listAuditLogs();
    expect(logs.map((l) => [l.actorName, l.subject])).toEqual([
      ["한담임", null],
      ["오수학", "수학"],
    ]);
  });

  it("getReviewInputs는 학생 본인만", async () => {
    await api.login("s01");
    const own = await api.listSessions({});
    const inputs = await api.getReviewInputs("s01");
    expect(inputs.sessions.map((s) => s.id).sort()).toEqual(own.map((s) => s.id).sort());
    expect(inputs.sessions.every((s) => typeof s.subject === "string" && s.subject.length > 0)).toBe(true);
    const ids = new Set(own.map((s) => s.id));
    expect(inputs.reflections.every((r) => ids.has(r.sessionId))).toBe(true);
    expect(inputs.attempts.every((a) => ids.has(a.sessionId))).toBe(true);
    await expectCode(api.getReviewInputs("s02"), "FORBIDDEN");
    for (const t of ["t1", "t3"]) {
      await api.login(t);
      await expectCode(api.getReviewInputs("s01"), "FORBIDDEN");
    }
  });

  it("시드: 수학 교과 교사 3반 집계에 다시 볼 후보와 많이 틀린 문항이 있다", async () => {
    await api.login("t3");
    const sum = await api.getSubjectSummary("c1", "수학");
    expect(sum.few).toBe(false);
    const t = sum.topics.find((x) => x.name === "이차함수 꼭짓점");
    expect(t).toBeTruthy();
    // 교과 공유 미동의 s02는 세지 않는다: 낮은 응시는 s01·s03·s05 3명
    expect(t!.reviewCount).toBe(3);
    expect(sum.hardQuestions.length).toBeGreaterThan(0);
    const students = await api.listSubjectStudents("c1", "수학");
    expect(students.some((x) => x.id === "s02")).toBe(false);
  });

  it("교과 교사 집계는 지난 학기 학습을 세지 않는다", async () => {
    // 2027-09-02(목): 이번 주(월 8/30~)에 8/31(1학기) 학습이 걸친다. 현재 학기(2027-2)가 아니라서 세지 않는다
    const now = new Date("2027-09-02T19:00:00+09:00");
    const count = async (extra: boolean) => {
      const seed = createSeed(now);
      if (extra) {
        const start = new Date("2027-08-31T15:00:00+09:00");
        seed.sessions.push({ id: "old-term-math", studentId: "s01", goal: { subject: "수학", activities: ["concept"] }, startedAt: start.toISOString(), endedAt: new Date(start.getTime() + 30 * 60000).toISOString(), startAuth: "FACEPASS", endAuth: "FACEPASS", status: "ENDED", durationMinutes: 30 });
      }
      const a = createMockApi({ seed, now: () => now, latencyMs: 0, storage: null });
      await a.login("t3");
      return (await a.getSubjectSummary("c1", "수학")).sessionCount;
    };
    const base = await count(false);
    expect(base).toBeGreaterThan(0);
    expect(await count(true)).toBe(base);
  });

  it("시드: 김가온 다시 볼 주제에 수학 - 이차함수 꼭짓점", async () => {
    await api.login("s01");
    const groups = reviewTopicsBySubject(await api.getReviewInputs("s01"));
    const math = groups.find((g) => g.subject === "수학");
    expect(math?.topics.map((x) => x.name)).toContain("이차함수 꼭짓점");
  });

  it("월요일 새벽에 만든 시드도 종료·기록 시각이 지금을 넘지 않는다", () => {
    const monday = new Date("2026-11-16T00:10:00+09:00");
    const seed = createSeed(monday);
    expect(seed.sessions.every((s) => !s.endedAt || s.endedAt <= monday.toISOString())).toBe(true);
    expect(seed.entries.every((e) => e.createdAt <= monday.toISOString())).toBe(true);
  });
});
