// 프론트 ↔ 백엔드 계약. docs/api-spec.md 와 같은 구조를 유지한다.

export type Role = "student" | "teacher";
/** FACEPASS: 얼굴 인증 / QR·BARCODE: 학생증 등 대체 수단 / MANUAL: 교사 수기 확인 */
export type AuthMethod = "FACEPASS" | "QR" | "BARCODE" | "MANUAL";
export type ConsentKind = "FACEPASS" | "AI" | "LEARNING_RECORD";
/** PAPER: 종이에 수기로 기록함 (쓰기 부담이 큰 학생용, 내용 입력은 선택) */
export type EntryKind = "MEMO" | "QUESTION" | "QUIZ" | "PAPER";
export type Visibility = "TEACHER" | "PRIVATE";

export type User = {
  id: string;
  name: string;
  role: Role;
  classId: string;
  number?: number;
  under14?: boolean;
};

/** 슈퍼스쿨에서 받는 학교 정보 범위 */
export type Student = { id: string; name: string; classId: string; number: number };

export type Consent = {
  kind: ConsentKind;
  granted: boolean;
  byGuardian: boolean;
  policyVersion: string;
  createdAt: string;
};

// 키오스크·학생 화면에 내려오는 인증 결과. 이름은 마스킹된 값만 받는다.
export type AuthEvent = {
  id: string;
  studentId: string | null;
  maskedName: string | null;
  deviceId: string;
  method: AuthMethod;
  success: boolean;
  verifiedAt: string;
  consumed: boolean;
};

export type SessionStatus = "ACTIVE" | "ENDED";

/** 학습 목표는 체크리스트(과목 + 활동)로 고르고, 메모는 선택 */
export type SessionGoal = {
  subject: string;
  activities: string[];
  note?: string;
};

// ---------- 주제 (반 단위 주제 사전) ----------
export type Topic = { id: string; classId: string; name: string; subject?: string };

/** 이번 세션 기록에서 AI가 찾은 주제. 근거 기록 ID 필수 */
export type SessionTopic = { topicId: string; name: string; subject?: string; evidenceIds: string[] };

// ---------- 주제 테스트 (고정 난이도 5문항: 개념 3 + 적용 2) ----------
/** 학생에게 내려가는 문항: 정답·해설 없음 */
export type StudentQuizQuestion = { id: string; type: "MCQ" | "OX"; prompt: string; choices: string[]; reported?: boolean };

export type QuizReportReason = "WRONG_ANSWER" | "UNCLEAR" | "UNRELATED";

/** AI의 문항 1차 검토 결과 */
export type QuizAiReview = { verdict: "OK" | "ERROR"; reason: string };
/** 신고 처리 결과. AI_OK: 문제 없어 채점에 포함 / AI_ERROR: 오류라 채점 제외·교사에게 / TO_TEACHER: 같은 문항 재신고라 채점 제외·교사에게 */
export type QuizReportOutcome = { review: "AI_OK" | "AI_ERROR" | "TO_TEACHER"; message: string };

export type QuizResultItem = {
  questionId: string;
  prompt: string;
  choices: string[];
  chosen: number | null;
  answerIndex: number;
  correct: boolean;
  explanation: string;
  reported: boolean; // 학생이 신고한 문항 → 채점(total)에서 제외
  excluded?: boolean; // 교사가 '문항 오류'로 제외 확정 → 이 문항을 푼 모든 응시에서 채점 제외
};

/** 주제별 성장 (학생 본인·교사). 정답률은 신고 제외 후 채점 문항이 있는 응시만 */
export type TopicGrowth = {
  topicId: string;
  name: string;
  subject?: string;
  sessions: number;
  minutes: number;
  attempts: number;
  firstRate: number | null;
  lastRate: number | null;
  lastTotal: number | null; // 최근 응시의 채점 문항 수 (신고 제외 후). 3개 미만이면 신호 없음
  lastUnderstanding: 1 | 2 | 3 | null;
  signal: "OVERCONFIDENT" | "LOW_SCORE" | null;
};

/** 기록 공유 미동의 학생을 교사가 볼 때는 shared=false, topics=[] (주제 이름도 기록 내용이므로), 전체 횟수·시간만 */
export type GrowthReport = { studentId: string; shared: boolean; topics: TopicGrowth[]; total: { sessions: number; minutes: number } };

export type ReportedQuestion = {
  reportId: string;
  topicName: string;
  prompt: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
  reason: QuizReportReason;
  /** AI_CLEARED: 문항의 첫 신고를 AI가 검토해 문제 없다고 봄 (교사 확인 목록엔 안 뜨고 신고 수에만 셈) */
  status: "OPEN" | "KEEP_EXCLUDED" | "DISMISSED" | "AI_CLEARED";
  /** 이 문항의 첫 신고에 대한 AI 검토 (없으면 null: 백엔드 미반영 등) */
  aiReview: QuizAiReview | null;
  /** 같은 반에서 이 문항이 신고된 횟수 (AI가 걸러 낸 신고 포함) */
  questionReportCount: number;
  studentNumber: number | null; // 기록 공유 미동의 학생이면 null (익명)
  studentReportCount: number | null; // 이 학생의 전체 신고 수 (남발 판단용), 미동의면 null
  createdAt: string;
};

export type QuizAttempt = {
  id: string;
  sessionId: string;
  topicId: string;
  studentId: string;
  correct: number;
  total: number; // 신고 제외 문항 수
  createdAt: string;
  items: QuizResultItem[];
};

export type LearningSession = {
  id: string;
  studentId: string;
  goal: SessionGoal;
  startedAt: string;
  endedAt: string | null;
  startAuth: AuthMethod;
  endAuth: AuthMethod | null;
  status: SessionStatus;
  durationMinutes: number | null;
};

export type LearningEntry = {
  id: string;
  sessionId: string;
  kind: EntryKind;
  content: string;
  visibility: Visibility;
  createdAt: string;
};

export type AiMessage = {
  id: string;
  sessionId: string;
  role: "student" | "ai";
  content: string;
  createdAt: string;
};

/** AI가 만든 문장은 반드시 근거 기록 ID를 가진다. 근거 없는 문장은 만들지 않는다. */
export type GroundedItem = {
  text: string;
  evidenceIds: string[];
};

export type SessionSummary = {
  activities: GroundedItem[];
  remainingQuestions: GroundedItem[];
};

/** 성찰은 체크리스트 중심. 주관식(note)은 참고용 선택 입력 */
export type Reflection = {
  sessionId: string;
  checks: string[];          // 체크한 항목 ID (lib/checklists.ts)
  understanding: 1 | 2 | 3 | null;  // 1: 아직 어려움, 2: 조금 이해, 3: 설명할 수 있음 / null: 예전 주관식 성찰
  legacyText?: string;       // 백엔드의 예전 주관식 성찰 원문 (체크리스트 형식이 아닐 때)
  remainingQuestions: string[];
  note?: string;
  updatedAt?: string;
};

export type Feedback = {
  id: string;
  sessionId: string;
  teacherId: string;
  content: string;
  createdAt: string;
  /** 학생이 읽은 시각. null이면 새 피드백 */
  readAt: string | null;
};

/** 교사 열람 기록 (학생: 누가 내 기록을 봤는지 / 교사: 내가 연 기록) */
export type AuditLog = { id: string; actorId: string; actorName: string; action: string; studentId: string | null; createdAt: string };

// 교차채점: AI가 근거와 함께 제안 → 교사가 확정. AI는 최종 판단하지 않는다.
export type RubricCriterion = {
  id: string;
  label: string;
  levels: string[]; // 낮은 단계 → 높은 단계
};

export type Rubric = {
  id: string;
  classId: string;
  title: string;
  criteria: RubricCriterion[];
};

export type CriterionScore = {
  criterionId: string;
  level: number | null; // levels 인덱스, 근거 부족이면 null
  reason: string;
  evidenceIds: string[];
};

export type Assessment = {
  sessionId: string;
  rubricId: string;
  ai: CriterionScore[] | null;
  teacher: CriterionScore[] | null;
  finalizedAt: string | null;
};

export type DashboardRow = {
  studentId: string;
  name: string;
  number: number;
  sessionCount: number;
  totalMinutes: number;
  openQuestionCount: number;
  lastSessionAt: string | null;
  needsAttention: boolean;
  /** 기간 안에 돌아보기를 남겼는데 아직 피드백이 없는 기록이 있음 (기록 공유 미동의면 false) */
  hasReflectionWithoutFeedback: boolean;
  activeNow: boolean;
  pendingAssessment: number;
  lastQuizRate: number | null; // 최근 단원 테스트 정답률 (공유 동의 없으면 null)
};

export type Dashboard = {
  classId: string;
  from: string;
  to: string;
  students: DashboardRow[];
};

// 토스플레이스 FacePass SDK 결과 (docs.tossplace.com/reference/plugin-sdk/front/face-pass)
// 얼굴 정보는 오지 않고, 등록된 사용자 키(시리얼)만 넘어온다.
export type FacePassResultCode =
  | "Authenticated"
  | "FaceFailed"
  | "Blocked"
  | "Denied"
  | "Disconnected"
  | "Canceled"
  | "Timeout";

export type FacePassRaw = {
  merchantUserKey?: string;
  authenticated: boolean;
  result: FacePassResultCode;
  message: string;
};

// ---------- 교사 반 분석 (원자료, 집계는 lib/analytics.ts) ----------
export type ClassAnalyticsRaw = {
  classId: string;
  from: string;
  to: string;
  students: Array<{ studentId: string; name: string; number: number; shared: boolean }>;
  /** 기간 내 반 학생 세션 (기록 공유 여부와 무관) */
  sessions: LearningSession[];
  /** 학생이 AI 도우미에 보낸 메시지. 기록 공유 학생만 */
  /** questionType: 서버 AI 분류(5-2). 없으면 null → 화면에서 규칙 분류로 대신함 */
  questions: Array<{ id: string; sessionId: string; studentId: string; content: string; createdAt: string; questionType?: "CONCEPT" | "CHECK" | "ANSWER" | "OTHER" | null }>;
  attempts: Array<{ sessionId: string; studentId: string; topicId: string; correct: number; total: number; createdAt: string }>;
  sessionTopics: Array<{ sessionId: string; topicId: string; name: string }>;
};
