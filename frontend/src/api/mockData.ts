// 데모·테스트용 가짜 데이터. 실제 학생 정보는 절대 넣지 않는다.
import type {
  AiMessage,
  Assessment,
  AuthEvent,
  Consent,
  ConsentKind,
  Feedback,
  LearningEntry,
  LearningSession,
  QuizAttempt,
  QuizReportReason,
  QuizAiReview,
  QuizReportOutcome,
  Reflection,
  Rubric,
  SessionTopic,
  QuestionThemes,
  TeacherAssignment,
  Topic,
  User,
} from "../types/domain";
import { currentTerm, seoulWeekStart } from "../lib/schoolCalendar";
import { TOPIC_DICTIONARY, type TopicLevel } from "./mockTopicData";
import { mockAiReply } from "./mockAiReply";

export type Db = {
  users: User[];
  /** 교과 교사 배정 (학기별). 담임 여부는 users.classId로 */
  assignments: TeacherAssignment[];
  qrTokens: Record<string, { studentId: string; expiresAt: string; used: boolean }>; // 1회용 QR
  consents: Record<string, Consent[]>;   // studentId → 동의 이력 (종류별 마지막 값이 현재)
  authEvents: AuthEvent[];
  sessions: LearningSession[];
  entries: LearningEntry[];
  aiMessages: AiMessage[];
  reflections: Reflection[];
  feedback: Feedback[];
  rubrics: Rubric[];
  assessments: Assessment[];
  auditLogs: Array<{ id?: string; actorId: string; action: string; targetStudentId: string | null; at: string; subject?: string | null }>;
  /** 반 단위 주제별 문항 풀 (정답 포함 → 학생에게 직접 노출 금지) */
  topicQuestions: TopicQuestion[];
  quizReports: QuizReport[];
  quizAttempts: QuizAttempt[];
  /** 세션별 출제 스냅샷 (섞인 선택지·맞춘 정답 번호). 채점은 이것으로 */
  quizServes: Record<string, { topicId: string; questions: ServedQuestion[] }>;
  /** 반 단위 주제 사전 (key = mock 사전 키, 실서비스에선 LLM이 기존 주제를 고름) */
  topics: Array<Topic & { key: string }>;
  /** 세션별 추출 주제 캐시 */
  sessionTopics: Record<string, SessionTopic[]>;
  /** 반·과목·주마다 1개 저장되는 질문 핵심 요약 (키: classId|subject|weekStart) */
  questionThemes?: Record<string, QuestionThemes>;
};

export type TopicQuestion = {
  id: string;
  topicId: string;
  type: "MCQ" | "OX";
  level: TopicLevel;
  prompt: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
  excluded: boolean; // 교사가 신고를 받아들여 풀에서 뺀 문항
};

export type QuizReport = {
  id: string;
  sessionId: string;
  questionId: string;
  studentId: string;
  classId: string;
  reason: QuizReportReason;
  status: "OPEN" | "KEEP_EXCLUDED" | "DISMISSED" | "AI_CLEARED";
  aiReview: QuizAiReview | null;
  createdAt: string;
};

export type ServedQuestion = {
  id: string;
  type: "MCQ" | "OX";
  prompt: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
  reported: boolean;
  excluded?: boolean;
  /** 이 출제에서 학생이 이미 신고했다면 그 결과 (같은 문항 재신고는 이 값을 그대로 돌려줌) */
  reportOutcome?: QuizReportOutcome;
};

const SURNAMES = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임"];
const GIVEN = [
  "가온", "나래", "다솜", "라온", "마루", "바다", "사랑", "아라", "자람", "차오",
  "하늘", "보람", "새봄", "슬기", "여름", "은솔", "지음", "초롱", "한결", "해솔",
  "누리", "단비", "도담", "미르", "빛나", "소담", "아름", "온새", "이든", "푸름",
];

/** 결정적 난수 (시드 고정) */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const POLICY = "2026-11-v1";
/** 교과 선생님 공유에 동의한 데모 학생 (s02 이나래는 빠짐) */
const SUBJECT_SHARE_IDS = new Set(["s01", "s03", "s05", "s06", "s08", "s09", "s10", "s11", "s12", "s13", "s14", "s16", "s18", "s20", "s99"]);

function consent(kind: ConsentKind, granted: boolean, at: string, byGuardian = false): Consent {
  return { kind, granted, byGuardian, policyVersion: POLICY, createdAt: at };
}

const SAMPLE_MEMOS = [
  "완전제곱식으로 바꾸면 꼭짓점이 보인다",
  "교과서 예제 3번까지 풀었음",
  "그래프를 직접 그려 보니 축의 방정식이 이해됨",
  "틀린 문제: 부호 실수 두 번",
  "핵심 개념을 표로 정리함",
];
const SAMPLE_QUESTIONS = [
  "이차함수 그래프에서 대칭축은 어떤 의미가 있지?", // 질문 요약 데모(낱말 묶음)와 겹치지 않게 '판별식'·'꼭짓점' 낱말을 쓰지 않음
  "왜 a가 음수면 위로 볼록이 되는 걸까?",
  "실생활에서 이차함수는 어디에 쓰이지?",
  "이 공식은 언제 쓰면 안 되나?",
];

export function createSeed(now: Date): Db {
  const r = rng(20261113);
  const iso = (d: Date) => d.toISOString();
  const nowIso = iso(now);

  const users: User[] = [
    { id: "t1", name: "한담임", role: "teacher", classId: "c1" },
    { id: "t2", name: "오선생", role: "teacher", classId: "c2" },
    // 교과만 맡은 교사: 담임 반 없음
    { id: "t3", name: "오수학", role: "teacher", classId: "" },
  ];
  const term = currentTerm(now);
  const assignments: TeacherAssignment[] = [
    { teacherId: "t3", classId: "c1", subject: "수학", term },
    { teacherId: "t3", classId: "c2", subject: "수학", term },
    // 한담임: c1 담임이면서 c2 국어 교과
    { teacherId: "t1", classId: "c2", subject: "국어", term },
  ];
  for (let i = 1; i <= 30; i++) {
    const id = `s${String(i).padStart(2, "0")}`;
    users.push({
      id,
      name: `${SURNAMES[(i - 1) % SURNAMES.length]}${GIVEN[i - 1]}`,
      role: "student",
      classId: "c1",
      number: i,
      under14: i === 30, // 30번: 만 14세 미만 (보호자 동의 데모)
    });
  }
  users.push({ id: "s99", name: "남다른", role: "student", classId: "c2", number: 1, under14: false });

  const consents: Record<string, Consent[]> = {};
  for (const u of users.filter((u) => u.role === "student")) {
    const g = !!u.under14;
    consents[u.id] = [
      // s04: AI 거부 / s30: 만 14세 미만, 보호자 동의
      consent("AI", u.id !== "s04", nowIso, g),
      consent("LEARNING_RECORD", true, nowIso, g),
      // 교과 선생님 공유: 일부 학생만 (이나래 s02 등은 없음)
      consent("SUBJECT_SHARE", SUBJECT_SHARE_IDS.has(u.id), nowIso, g),
    ];
  }

  const sessions: LearningSession[] = [];
  const entries: LearningEntry[] = [];
  const reflections: Reflection[] = [];
  const quizAttempts: QuizAttempt[] = [];
  // 반 c1 주제 사전·문항 풀 (데모: 이미 다른 학생들이 쓰던 주제)
  const topics: Db["topics"] = TOPIC_DICTIONARY.map((d) => ({ id: "topic-c1-" + d.key, classId: "c1", key: d.key, name: d.name, subject: d.subject }));
  const topicQuestions: TopicQuestion[] = TOPIC_DICTIONARY.flatMap((d) =>
    d.pool.map((q, i) => ({ id: "tq-" + d.key + "-" + (i + 1), topicId: "topic-c1-" + d.key, ...q, choices: [...q.choices], excluded: false })),
  );
  const sessionTopics: Db["sessionTopics"] = {};
  const qr = rng(4242);
  let seq = 0;
  const nextId = (p: string) => `${p}-seed-${++seq}`;

  for (const u of users.filter((u) => u.role === "student" && u.classId === "c1")) {
    // 일부 학생은 최근 기록 없음 (도움 필요 신호 데모)
    const count = u.id === "s07" || u.id === "s15" ? 0 : Math.floor(r() * 6) + 1;
    for (let k = 0; k < count; k++) {
      const daysAgo = Math.floor(r() * 13) + 1;
      const start = new Date(now.getTime() - daysAgo * 86400000);
      start.setHours(19 + Math.floor(r() * 2), Math.floor(r() * 60), 0, 0);
      const minutes = 20 + Math.floor(r() * 80);
      const end = new Date(start.getTime() + minutes * 60000);
      const sid = nextId("sess");
      const subject = ["수학", "영어", "국어", "과학"][Math.floor(r() * 4)];
      // 단원 테스트 데모용: 별도 난수로 단원을 붙인다 (기존 시드 값은 그대로 유지)
      // 주제별 성장 데모: 별도 난수로 그 과목의 사전 주제를 붙인다 (기존 시드 값은 유지)
      const subjectTopics = TOPIC_DICTIONARY.filter((d) => d.subject === subject);
      const dict = subjectTopics.length && qr() < 0.8 ? subjectTopics[Math.floor(qr() * subjectTopics.length)] : undefined;
      sessions.push({
        id: sid,
        studentId: u.id,
        goal: { subject, activities: [["concept", "problem", "review", "summary"][Math.floor(r() * 4)]] },
        startedAt: iso(start),
        endedAt: iso(end),
        startAuth: "QR",
        endAuth: "QR",
        status: "ENDED",
        durationMinutes: minutes,
      });
      const n = 1 + Math.floor(r() * 4);
      for (let j = 0; j < n; j++) {
        const isQ = r() < 0.35;
        entries.push({
          id: nextId("entry"),
          sessionId: sid,
          kind: isQ ? "QUESTION" : u.id === "s12" ? "PAPER" : "MEMO",
          content: isQ
            ? SAMPLE_QUESTIONS[Math.floor(r() * SAMPLE_QUESTIONS.length)]
            : u.id === "s12"
              ? ""
              : SAMPLE_MEMOS[Math.floor(r() * SAMPLE_MEMOS.length)],
          visibility: r() < 0.15 ? "PRIVATE" : "TEACHER",
          createdAt: iso(new Date(start.getTime() + (j + 1) * 7 * 60000)),
        });
      }
      const rq = u.id === "s05" ? 2 : r() < 0.4 ? 1 : 0;
      const understanding = (1 + Math.floor(r() * 3)) as 1 | 2 | 3;
      reflections.push({
        sessionId: sid,
        checks: ["goal_done", "new_learned", "asked", "next_plan"].filter(() => r() < 0.6),
        understanding,
        remainingQuestions: SAMPLE_QUESTIONS.slice(0, rq),
        updatedAt: iso(end),
      });
      // 주제·테스트 결과 (s09는 '이해했다는데 점수 낮음' 데모)
      if (dict) {
        const topicId = "topic-c1-" + dict.key;
        const evId = nextId("entry");
        entries.push({ id: evId, sessionId: sid, kind: "MEMO", content: dict.keywords[0] + " 정리", visibility: "TEACHER", createdAt: iso(new Date(start.getTime() + 3 * 60000)) });
        sessionTopics[sid] = [{ topicId, name: dict.name, subject: dict.subject, evidenceIds: [evId] }];
        if (qr() < 0.85) {
          const pool = topicQuestions.filter((x) => x.topicId === topicId);
          const qs = [...pool.filter((x) => x.level === "CONCEPT").slice(0, 3), ...pool.filter((x) => x.level === "APPLY").slice(0, 2)];
          const pCorrect = u.id === "s09" ? 0.2 : 0.35 + understanding * 0.18;
          const items = qs.map((x) => {
            const ok = qr() < pCorrect;
            const chosen = ok ? x.answerIndex : (x.answerIndex + 1) % x.choices.length;
            return { questionId: x.id, prompt: x.prompt, choices: [...x.choices], chosen, answerIndex: x.answerIndex, correct: ok, explanation: x.explanation, reported: false };
          });
          if (u.id === "s09") reflections[reflections.length - 1].understanding = 3;
          quizAttempts.push({ id: nextId("quiz"), sessionId: sid, topicId, studentId: u.id, correct: items.filter((i) => i.correct).length, total: items.length, createdAt: iso(end), items });
        }
      }
    }
  }

  // 교과 교사 데모: 김가온(s01)·남다른(s99)의 이번 주 수학·국어 학습 (기존 난수 순서는 건드리지 않음)
  const weekStartMs = Date.parse(`${seoulWeekStart(now)}T00:00:00+09:00`);
  const weekRuns: Array<{ studentId: string; subject: string; hoursAgo: number; memo: string; question: string }> = [
    { studentId: "s01", subject: "수학", hoursAgo: 3, memo: "완전제곱식으로 바꾸면 꼭짓점이 보인다", question: "이차함수 그래프에서 대칭축은 어떤 의미가 있지?" },
    { studentId: "s01", subject: "국어", hoursAgo: 2, memo: "시의 화자와 상황을 표로 정리함", question: "비유랑 상징은 어떻게 구분하지?" },
    { studentId: "s99", subject: "수학", hoursAgo: 3, memo: "일차부등식 풀이 연습", question: "음수를 곱하면 왜 부등호가 바뀌지?" },
    { studentId: "s99", subject: "국어", hoursAgo: 2, memo: "설명문 문단 요약", question: "중심 문장은 어떻게 찾지?" },
  ];
  for (const w of weekRuns) {
    // 월요일 새벽에 시드를 만들어도 이번 주 안에 들어가게 주 시작 뒤로 맞춘다
    const start = new Date(Math.min(now.getTime(), Math.max(weekStartMs + 60_000, now.getTime() - w.hoursAgo * 3600_000)));
    const end = new Date(Math.min(start.getTime() + 30 * 60000, now.getTime())); // 종료가 지금보다 늦지 않게
    // 기록 시각도 종료 시각을 넘지 않게
    const atMin = (m: number) => iso(new Date(Math.min(start.getTime() + m * 60000, end.getTime())));
    const sid = nextId("sess");
    sessions.push({ id: sid, studentId: w.studentId, goal: { subject: w.subject, activities: ["concept"] }, startedAt: iso(start), endedAt: iso(end), startAuth: "QR", endAuth: "QR", status: "ENDED", durationMinutes: Math.round((end.getTime() - start.getTime()) / 60000) });
    entries.push(
      { id: nextId("entry"), sessionId: sid, kind: "MEMO", content: w.memo, visibility: "TEACHER", createdAt: atMin(5) },
      { id: nextId("entry"), sessionId: sid, kind: "QUESTION", content: w.question, visibility: "TEACHER", createdAt: atMin(10) },
      { id: nextId("entry"), sessionId: sid, kind: "MEMO", content: "나만 보는 메모", visibility: "PRIVATE", createdAt: atMin(15) },
    );
    reflections.push({ sessionId: sid, checks: ["goal_done"], understanding: 2, remainingQuestions: [], updatedAt: iso(end) });
  }

  const rubrics: Rubric[] = [
    {
      id: "r1",
      classId: "c1",
      title: "자기주도학습 관찰 기준",
      criteria: [
        { id: "planning", label: "목표 세우기", levels: ["노력 필요", "보통", "잘함"] },
        { id: "questioning", label: "질문하기", levels: ["노력 필요", "보통", "잘함"] },
        { id: "reflection", label: "돌아보기", levels: ["노력 필요", "보통", "잘함"] },
        { id: "ai_use", label: "AI 비판적 활용", levels: ["노력 필요", "보통", "잘함"] },
      ],
    },
    {
      id: "r2",
      classId: "c2",
      title: "자기주도학습 관찰 기준",
      criteria: [{ id: "planning", label: "목표 세우기", levels: ["노력 필요", "보통", "잘함"] }],
    },
  ];

  // 반 분석 데모: AI 도우미 질문 (별도 난수라 기존 시드 값은 그대로). AI 미동의 학생(s04)은 질문 없음
  const aiMessages: AiMessage[] = [];
  const ar = rng(8642);
  // 과목별 예문 (데모에서 학습 과목과 질문이 어긋나 보이지 않게)
  type QType = "CONCEPT" | "CHECK" | "ANSWER" | "OTHER";
  const QUESTION_BANK: Record<string, Record<QType, string[]>> = {
    수학: {
      CONCEPT: ["왜 꼭짓점의 x좌표가 -b/2a 이야?", "완전제곱식이 뭐야?", "부등식에 음수를 곱하면 왜 부등호가 바뀌어?"],
      CHECK: ["이렇게 풀었는데 맞아?", "x=3 나왔는데 확인해줘", "부등호 방향 이렇게 바꾸는 게 맞지?"],
      ANSWER: ["그냥 답 알려줘", "정답이 뭐야?", "이 문제 다 풀어줘"],
      OTHER: ["오늘 뭐부터 하면 좋을까", "고마워"],
    },
    영어: {
      CONCEPT: ["관계대명사 who랑 which 차이가 뭐야?", "선행사가 뭐야?", "왜 여기엔 that을 못 써?"],
      CHECK: ["내가 쓴 문장 맞는지 봐줘", "이렇게 해석했는데 맞아?"],
      ANSWER: ["해석 그냥 알려줘", "정답이 뭐야?", "빈칸 답 알려줘"],
      OTHER: ["단어 외우는 방법 있어?", "고마워"],
    },
    과학: {
      CONCEPT: ["질량 보존 법칙은 왜 성립해?", "화학 반응이 뭐야?", "기체가 나오면 질량은 어떻게 돼?"],
      CHECK: ["반응 전후 질량 같다고 썼는데 맞아?", "이렇게 정리했는데 확인해줘"],
      ANSWER: ["그냥 답 알려줘", "정답이 뭐야?"],
      OTHER: ["시험 범위가 어디까지야", "고마워"],
    },
    국어: {
      CONCEPT: ["비유랑 상징 차이가 뭐야?", "이 시에서 화자는 왜 그렇게 말해?", "주제를 어떻게 찾아?"],
      CHECK: ["주제를 이렇게 정리했는데 맞아?", "내가 찾은 근거 맞는지 봐줘"],
      ANSWER: ["주제 그냥 알려줘", "정답이 뭐야?"],
      OTHER: ["오늘 뭐부터 하면 좋을까", "고마워"],
    },
  };
  // 학생마다 질문 성향을 다르게 해서 분포가 보이게 한다
  const STYLE: QType[][] = [
    ["CONCEPT", "CONCEPT", "CHECK", "OTHER"],
    ["ANSWER", "ANSWER", "CHECK", "CONCEPT"],
    ["CHECK", "CHECK", "CONCEPT", "ANSWER"],
  ];
  for (const s of sessions) {
    if (s.studentId === "s04") continue;
    const num = users.find((u) => u.id === s.studentId)?.number ?? 0;
    if (num % 5 === 0) continue; // 질문을 거의 안 하는 학생도 있게
    const style = STYLE[num % STYLE.length];
    const count = Math.floor(ar() * 4);
    const start = new Date(s.startedAt).getTime();
    for (let k = 0; k < count; k++) {
      const type = style[Math.floor(ar() * style.length)];
      const bank = (QUESTION_BANK[s.goal.subject] ?? QUESTION_BANK["수학"])[type];
      const at = new Date(start + (k + 1) * 5 * 60000);
      const question = bank[Math.floor(ar() * bank.length)];
      aiMessages.push({ id: nextId("ai"), sessionId: s.id, role: "student", content: question, createdAt: iso(at) });
      aiMessages.push({ id: nextId("ai"), sessionId: s.id, role: "ai", content: mockAiReply(question), createdAt: iso(new Date(at.getTime() + 30000)) });
    }
  }

  // 교과 교사 집계 데모: 이번 주 3반 수학 '이차함수 꼭짓점' 테스트 (AI 질문 난수 뒤에 붙여 기존 시드 값은 그대로)
  // s03·s05는 0문항, s01은 1문항(다시 볼 후보), s06은 4/5, s02(교과 공유 미동의)도 낮지만 집계에 들어가면 안 된다
  const vertex = TOPIC_DICTIONARY.find((d) => d.key === "quadratic-vertex")!;
  const vertexId = "topic-c1-" + vertex.key;
  const vertexPool = topicQuestions.filter((x) => x.topicId === vertexId);
  const vertexQs = [...vertexPool.filter((x) => x.level === "CONCEPT").slice(0, 3), ...vertexPool.filter((x) => x.level === "APPLY").slice(0, 2)];
  const vertexRuns: Array<{ studentId: string; correctIdx: number[] }> = [
    { studentId: "s03", correctIdx: [] },
    { studentId: "s05", correctIdx: [] },
    { studentId: "s02", correctIdx: [] },
    { studentId: "s06", correctIdx: [0, 1, 2, 3] },
    { studentId: "s01", correctIdx: [0] },
  ];
  vertexRuns.forEach((v, order) => {
    // 월요일 새벽에 만들어도 [주 시작, 지금] 안에 들어가게 구간을 나눠 배치한다 (뒤쪽일수록 최근, s01이 마지막)
    const span = Math.max(0, now.getTime() - (weekStartMs + 60_000));
    const frac = (order + 1) / (vertexRuns.length + 1);
    const start = new Date(Math.min(now.getTime(), weekStartMs + 60_000 + span * frac * 0.9));
    const end = new Date(Math.min(start.getTime() + Math.min(30 * 60000, span * 0.05), now.getTime()));
    const sid = nextId("sess");
    sessions.push({ id: sid, studentId: v.studentId, goal: { subject: "수학", activities: ["problem"] }, startedAt: iso(start), endedAt: iso(end), startAuth: "QR", endAuth: "QR", status: "ENDED", durationMinutes: Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000)) });
    const evId = nextId("entry");
    entries.push({ id: evId, sessionId: sid, kind: "MEMO", content: "꼭짓점 구하는 방법 정리", visibility: "TEACHER", createdAt: iso(end) });
    reflections.push({ sessionId: sid, checks: ["goal_done"], understanding: 2, remainingQuestions: [], updatedAt: iso(end) });
    sessionTopics[sid] = [{ topicId: vertexId, name: vertex.name, subject: "수학", evidenceIds: [evId] }];
    const items = vertexQs.map((x, i) => {
      const ok = v.correctIdx.includes(i);
      const chosen = ok ? x.answerIndex : (x.answerIndex + 1) % x.choices.length;
      return { questionId: x.id, prompt: x.prompt, choices: [...x.choices], chosen, answerIndex: x.answerIndex, correct: ok, explanation: x.explanation, reported: false };
    });
    quizAttempts.push({ id: nextId("quiz"), sessionId: sid, topicId: vertexId, studentId: v.studentId, correct: items.filter((i) => i.correct).length, total: items.length, createdAt: iso(end), items });
  });

  // 과목 질문 핵심 요약 데모(이번 주 3반 수학 질문, 기존 난수 뒤에 붙여 기존 시드 값은 그대로):
  // 꼭짓점 순서 4명 · 판별식 3명 · 일차부등식 2명(3명 미만이라 숨김) + 제외 확인용(교과 공유 미동의 s02, PRIVATE 질문)
  const themeSpan = Math.max(0, now.getTime() - (weekStartMs + 60_000));
  const themeRuns: Array<{ studentId: string; question: string; topic: "order" | "disc" | "sign"; visibility: "TEACHER" | "PRIVATE" }> = [
    { studentId: "s08", question: "꼭짓점은 어떤 순서로 구해야 해?", topic: "order", visibility: "TEACHER" },
    { studentId: "s09", question: "꼭짓점 좌표를 구하는 순서가 헷갈려. 어떻게 해?", topic: "order", visibility: "TEACHER" },
    { studentId: "s10", question: "완전제곱식으로 바꾼 다음 꼭짓점은 어떻게 읽어?", topic: "order", visibility: "TEACHER" },
    { studentId: "s11", question: "꼭짓점 구하는 순서를 왜 이렇게 해?", topic: "order", visibility: "TEACHER" },
    { studentId: "s12", question: "판별식이 0이면 꼭짓점이 x축에 닿는 이유가 뭐야?", topic: "disc", visibility: "TEACHER" },
    { studentId: "s13", question: "판별식과 꼭짓점은 무슨 관계야?", topic: "disc", visibility: "TEACHER" },
    { studentId: "s14", question: "판별식으로 꼭짓점 위치를 알 수 있어?", topic: "disc", visibility: "TEACHER" },
    { studentId: "s16", question: "부등호 방향은 언제 바뀌는지 어떻게 알아?", topic: "sign", visibility: "TEACHER" },
    { studentId: "s18", question: "음수로 나누면 왜 부등호가 뒤집혀?", topic: "sign", visibility: "TEACHER" },
    { studentId: "s02", question: "꼭짓점 구하는 순서 좀 알려 줘", topic: "order", visibility: "TEACHER" }, // 교과 공유 미동의: 제외
    { studentId: "s20", question: "나만 아는 개인 질문이야", topic: "order", visibility: "PRIVATE" }, // 비공개: 제외
  ];
  // 세션 주제는 기존 사전 주제를 그대로 쓴다(가짜 주제를 만들지 않음). 묶음은 질문 글의 낱말로 나뉜다.
  const ineqDict = TOPIC_DICTIONARY.find((d) => d.key === "linear-inequality")!;
  const themeTopics = {
    order: { id: vertexId, name: vertex.name, memo: vertex.keywords[0] + " 정리" },
    disc: { id: vertexId, name: vertex.name, memo: vertex.keywords[0] + " 정리" },
    sign: { id: "topic-c1-" + ineqDict.key, name: ineqDict.name, memo: ineqDict.keywords[0] + " 정리" },
  } as const;
  themeRuns.forEach((t, order) => {
    const frac = (order + 1) / (themeRuns.length + 1);
    const start = new Date(Math.min(now.getTime(), weekStartMs + 60_000 + themeSpan * frac * 0.9));
    const end = new Date(Math.min(start.getTime() + Math.min(20 * 60000, themeSpan * 0.03), now.getTime()));
    const sid = nextId("sess");
    sessions.push({ id: sid, studentId: t.studentId, goal: { subject: "수학", activities: ["concept"] }, startedAt: iso(start), endedAt: iso(end), startAuth: "QR", endAuth: "QR", status: "ENDED", durationMinutes: Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000)) });
    entries.push({ id: nextId("entry"), sessionId: sid, kind: "QUESTION", content: t.question, visibility: t.visibility, createdAt: iso(end) });
    reflections.push({ sessionId: sid, checks: ["goal_done"], understanding: 2, remainingQuestions: [], updatedAt: iso(end) });
    if (t.topic) {
      const dict = themeTopics[t.topic];
      const evId = nextId("entry");
      entries.push({ id: evId, sessionId: sid, kind: "MEMO", content: dict.memo, visibility: "TEACHER", createdAt: iso(end) });
      sessionTopics[sid] = [{ topicId: dict.id, name: dict.name, subject: "수학", evidenceIds: [evId] }];
    }
  });

  return {
    users,
    assignments,
    qrTokens: {},
    consents,
    authEvents: [],
    sessions,
    entries,
    aiMessages,
    reflections,
    feedback: [],
    rubrics,
    assessments: [],
    auditLogs: [],
    topicQuestions,
    quizReports: [],
    quizAttempts,
    quizServes: {},
    topics,
    sessionTopics,
    questionThemes: {},
  };
}
