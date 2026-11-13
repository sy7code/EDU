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
  unitId?: string; // 단원 테스트 대상 단원 (선택)
};

// ---------- 단원 테스트 ----------
export type Unit = {
  id: string;
  classId: string;
  subject: string;
  order: number;
  title: string;
  standard: string; // 성취기준 문장 (AI 초안의 근거)
  material?: string;
};

export type QuizQuestion = {
  id: string;
  unitId: string;
  type: "MCQ" | "OX";
  prompt: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
  source: "AI" | "TEACHER";
  status: "DRAFT" | "APPROVED";
  evidence: string; // 근거 문장 (성취기준·자료)
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
  understanding: 1 | 2 | 3;  // 1: 아직 어려움, 2: 조금 이해, 3: 설명할 수 있음
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
};

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
  activeNow: boolean;
  pendingAssessment: number;
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
