import type {
  AiMessage,
  Assessment,
  AuthEvent,
  CriterionScore,
  QuizAttempt,
  QuizQuestion,
  Rubric,
  SessionTopic,
  StudentOverview,
  StudentQuizQuestion,
  Unit,
  SessionGoal,
  Consent,
  ConsentKind,
  Dashboard,
  EntryKind,
  FacePassRaw,
  Feedback,
  LearningEntry,
  LearningSession,
  Reflection,
  SessionSummary,
  Student,
  User,
  Visibility,
} from "../types/domain";

export type ApiErrorCode =
  | "UNAUTHENTICATED"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "CONSENT_REQUIRED"
  | "SESSION_ALREADY_ACTIVE"
  | "SESSION_ALREADY_ENDED"
  | "SESSION_NOT_ACTIVE"
  | "AUTH_EVENT_INVALID"
  | "AUTH_STUDENT_MISMATCH"
  | "VALIDATION"
  | "RATE_LIMITED"
  | "AI_TIMEOUT"
  | "QUIZ_ALREADY_TAKEN"
  | "QUIZ_NOT_AVAILABLE"
  | "UNKNOWN";

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  constructor(code: ApiErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = "ApiError";
  }
}

/** 사용자에게 보여줄 문구. 서버 에러 원문은 노출하지 않는다. */
export function errorMessage(err: unknown): string {
  const code = err instanceof ApiError ? err.code : "UNKNOWN";
  const map: Record<ApiErrorCode, string> = {
    UNAUTHENTICATED: "다시 로그인해 주세요.",
    NOT_FOUND: "찾을 수 없거나 볼 수 있는 권한이 없어요.",
    FORBIDDEN: "이 작업을 할 수 있는 권한이 없어요.",
    CONSENT_REQUIRED: "이 기능을 쓰려면 동의가 필요해요. 동의 설정을 확인해 주세요.",
    SESSION_ALREADY_ACTIVE: "이미 진행 중인 학습이 있어요.",
    SESSION_ALREADY_ENDED: "이미 끝난 학습이에요.",
    SESSION_NOT_ACTIVE: "진행 중인 학습에만 기록할 수 있어요.",
    AUTH_EVENT_INVALID: "인증이 만료되었거나 이미 사용되었어요. 다시 인증해 주세요.",
    AUTH_STUDENT_MISMATCH: "본인 인증 결과가 아니에요. 다시 인증해 주세요.",
    VALIDATION: "입력 내용을 확인해 주세요.",
    RATE_LIMITED: "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.",
    AI_TIMEOUT: "AI 응답이 늦어지고 있어요. 다시 시도해 주세요.",
    QUIZ_ALREADY_TAKEN: "이번 학습의 단원 테스트는 이미 제출했어요.",
    QUIZ_NOT_AVAILABLE: "단원을 고르고 학습을 마친 뒤에 테스트를 볼 수 있어요.",
    UNKNOWN: "문제가 생겼어요. 잠시 후 다시 시도해 주세요.",
  };
  return map[code];
}

export interface Api {
  // 계정 (데모: 로그인 대신 사용자 선택)
  listDemoUsers(): Promise<User[]>;
  login(userId: string): Promise<User>;
  /** 실제 백엔드 로그인 (Supabase Auth). mock에선 지원 안 함 */
  signIn(email: string, password: string): Promise<User>;
  logout(): Promise<void>;
  me(): Promise<User | null>;

  // 동의
  getConsents(): Promise<Consent[]>;
  saveConsents(input: Array<{ kind: ConsentKind; granted: boolean; byGuardian: boolean }>): Promise<Consent[]>;

  // 학교 데이터 (슈퍼스쿨 어댑터 자리)
  listStudents(classId: string): Promise<Student[]>;

  // 인증 (키오스크 → 서버)
  submitFaceAuth(deviceId: string, raw: FacePassRaw): Promise<AuthEvent>;
  /** 학생 기기에 띄울 QR 토큰 발급 (랜덤, 1회용, 60초) */
  issueQrToken(): Promise<{ token: string; expiresAt: string }>;
  /** QR·학생증 바코드. QR은 1회용·60초, 바코드는 학생증 고정값(기록에 '바코드'로 표시) */
  submitCodeAuth(deviceId: string, method: "QR" | "BARCODE", token: string): Promise<AuthEvent>;
  /** 교사가 수기로 출석·학습 시작을 확인 (기기·얼굴 인증을 원하지 않는 학생) */
  submitManualAuth(studentId: string): Promise<AuthEvent>;
  /** 학생 화면: 최근 2분 내 미사용 본인 인증 이벤트 */
  getPendingAuthEvent(): Promise<AuthEvent | null>;
  /** 개발·데모 전용. 운영에서는 서버가 404 */
  simulateFaceAuth(deviceId: string, studentId: string, success: boolean): Promise<AuthEvent>;

  // 세션
  getActiveSession(): Promise<LearningSession | null>;
  startSession(input: { goal: SessionGoal; authEventId: string }): Promise<LearningSession>;
  endSession(sessionId: string, authEventId: string): Promise<LearningSession>;
  getSession(sessionId: string): Promise<LearningSession>;
  listSessions(filter: { studentId?: string }): Promise<LearningSession[]>;

  // 기록
  addEntry(input: { sessionId: string; kind: EntryKind; content: string; visibility: Visibility }): Promise<LearningEntry>;
  listEntries(sessionId: string): Promise<LearningEntry[]>;

  // AI
  listAiMessages(sessionId: string): Promise<AiMessage[]>;
  askAi(sessionId: string, content: string): Promise<AiMessage>;
  summarizeSession(sessionId: string): Promise<SessionSummary>;

  // 성찰·피드백
  getReflection(sessionId: string): Promise<Reflection | null>;
  saveReflection(r: Reflection): Promise<Reflection>;
  listFeedback(sessionId: string): Promise<Feedback[]>;
  addFeedback(sessionId: string, content: string): Promise<Feedback>;

  // 교사
  getDashboard(classId: string): Promise<Dashboard>;
  /** 학생 종합 보드: 단원별 학습량·테스트·이해도·신호 (교사만, 자기 반) */
  getStudentOverview(studentId: string): Promise<StudentOverview>;

  // 주제 (AI가 기록에서 추출, 반 주제 사전으로 이름 통일)
  /** 본인 ENDED 세션의 주제 1~3개. 근거 없는 주제는 만들지 않음. 결과는 캐시 */
  extractTopics(sessionId: string): Promise<SessionTopic[]>;

  // 단원·문제 관리 (교사)
  listUnits(classId: string): Promise<Unit[]>;
  listUnitQuestions(unitId: string): Promise<QuizQuestion[]>;
  /** 성취기준을 근거로 DRAFT 문제 3개 생성. 근거가 없으면 VALIDATION */
  draftQuestionsWithAi(unitId: string): Promise<QuizQuestion[]>;
  /** id가 빈 문자열이면 새로 만든다 */
  saveQuestion(q: QuizQuestion): Promise<QuizQuestion>;
  setQuestionStatus(id: string, status: "DRAFT" | "APPROVED"): Promise<QuizQuestion>;
  deleteQuestion(id: string): Promise<void>;

  // 단원 테스트 (학생)
  /** 본인 ENDED 세션 + 단원 있음. 승인 문제 최대 5개, 정답·해설 없음 */
  getQuiz(sessionId: string): Promise<{ unit: Unit; questions: StudentQuizQuestion[] }>;
  /** 세션당 1회. 채점 결과(정답·해설 포함)를 돌려준다 */
  submitQuiz(sessionId: string, answers: Record<string, number | null>): Promise<QuizAttempt>;
  /** 학생 본인 / 교사(기록 공유 동의 시) */
  getQuizAttempt(sessionId: string): Promise<QuizAttempt | null>;

  // 교차채점 (AI 제안 → 교사 확정)
  getRubric(classId: string): Promise<Rubric>;
  getAssessment(sessionId: string): Promise<Assessment | null>;
  requestAiAssessment(sessionId: string): Promise<Assessment>;
  finalizeAssessment(sessionId: string, scores: CriterionScore[]): Promise<Assessment>;
}
