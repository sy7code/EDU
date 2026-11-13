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
  Reflection,
  Rubric,
  SessionTopic,
  Topic,
  User,
} from "../types/domain";
import { TOPIC_DICTIONARY, type TopicLevel } from "./mockTopicData";

export type Db = {
  users: User[];
  facepassLinks: Record<string, string>; // merchantUserKey(시리얼) → studentId
  qrTokens: Record<string, { studentId: string; expiresAt: string; used: boolean }>; // 1회용 QR
  barcodes: Record<string, string>;      // 학생증 바코드(추측 불가 값) → studentId
  consents: Record<string, Consent[]>;   // studentId → 동의 이력 (종류별 마지막 값이 현재)
  authEvents: AuthEvent[];
  sessions: LearningSession[];
  entries: LearningEntry[];
  aiMessages: AiMessage[];
  reflections: Reflection[];
  feedback: Feedback[];
  rubrics: Rubric[];
  assessments: Assessment[];
  auditLogs: Array<{ actorId: string; action: string; targetStudentId: string | null; at: string }>;
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
  status: "OPEN" | "KEEP_EXCLUDED" | "DISMISSED";
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
  "판별식과 꼭짓점은 어떤 관계가 있지?",
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

  const facepassLinks: Record<string, string> = {};
  const barcodes: Record<string, string> = {};
  const consents: Record<string, Consent[]> = {};
  const codeRng = rng(97531);
  for (const u of users.filter((u) => u.role === "student")) {
    facepassLinks[`serial-${u.id}`] = u.id;
    // 학생 ID에서 유추할 수 없는 12자리 학생증 번호
    barcodes[String(Math.floor(codeRng() * 9e11) + 1e11)] = u.id;
    const g = !!u.under14;
    consents[u.id] = [
      // s03: 얼굴 인증 거부 (QR 사용) / s04: AI 거부 / s30: 만 14세 미만, 보호자 동의
      consent("FACEPASS", u.id !== "s03", nowIso, g),
      consent("AI", u.id !== "s04", nowIso, g),
      consent("LEARNING_RECORD", true, nowIso, g),
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
        startAuth: u.id === "s03" ? "QR" : "FACEPASS",
        endAuth: u.id === "s03" ? "QR" : "FACEPASS",
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
      aiMessages.push({ id: nextId("ai"), sessionId: s.id, role: "student", content: bank[Math.floor(ar() * bank.length)], createdAt: iso(at) });
      aiMessages.push({ id: nextId("ai"), sessionId: s.id, role: "ai", content: "좋은 질문이에요. 먼저 스스로 어디까지 생각했는지 말해 볼래요?", createdAt: iso(new Date(at.getTime() + 30000)) });
    }
  }

  return {
    users,
    facepassLinks,
    qrTokens: {},
    barcodes,
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
  };
}
