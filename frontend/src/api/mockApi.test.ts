import { beforeEach, describe, expect, it } from "vitest";
import { createMockApi } from "./mockApi";
import { createSeed } from "./mockData";
import { TOPIC_DICTIONARY } from "./mockTopicData";
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

  it("남의 피드백은 읽음으로 할 수 없다", async () => {
    const f = await feedbackFor("s02");
    await api.login("s01");
    await expectCode(api.markFeedbackRead(f.id), "NOT_FOUND");
    await api.login("t1");
    await expectCode(api.markFeedbackRead(f.id), "FORBIDDEN");
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

