import type {
  AuditLog,
  ClassAnalyticsRaw,
  AiMessage,
  Assessment,
  AuthEvent,
  CriterionScore,
  QuizAttempt,
  Rubric,
  ReviewInputs,
  SessionTopic,
  StudentQuizQuestion,
  SubjectWeekSummary,
  QuestionThemes,
  TeacherAssignment,
  GrowthReport,
  QuizReportReason,
  QuizReportOutcome,
  ReportedQuestion,
  SessionGoal,
  Consent,
  ConsentKind,
  Dashboard,
  EntryKind,
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
  | "GUARDIAN_CONSENT_REQUIRED"
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
  | "AI_BAD_OUTPUT"
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
    GUARDIAN_CONSENT_REQUIRED: "만 14세 미만은 보호자 동의를 받은 뒤에 '동의함'을 고를 수 있어요.",
    SESSION_ALREADY_ACTIVE: "이미 진행 중인 학습이 있어요.",
    SESSION_ALREADY_ENDED: "이미 끝난 학습이에요.",
    SESSION_NOT_ACTIVE: "진행 중인 학습에만 기록할 수 있어요.",
    AUTH_EVENT_INVALID: "인증이 만료되었거나 이미 사용되었어요. 다시 인증해 주세요.",
    AUTH_STUDENT_MISMATCH: "본인 인증 결과가 아니에요. 다시 인증해 주세요.",
    VALIDATION: "입력 내용을 확인해 주세요.",
    RATE_LIMITED: "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.",
    AI_TIMEOUT: "AI 응답이 늦어지고 있어요. 다시 시도해 주세요.",
    QUIZ_ALREADY_TAKEN: "이번 학습의 단원 테스트는 이미 제출했어요.",
    QUIZ_NOT_AVAILABLE: "학습을 마친 뒤, 이번 기록에서 찾은 주제로만 테스트를 볼 수 있어요.",
    AI_BAD_OUTPUT: "AI가 결과를 제대로 만들지 못했어요. 다시 시도해 주세요.",
    UNKNOWN: "문제가 생겼어요. 잠시 후 다시 시도해 주세요.",
  };
  return map[code];
}

/** 실시간 기록 구독 상태 */
export type RealtimeStatus = "ok" | "unavailable";

export type PaceInputsResult = {
  shared: boolean;
  sessions: LearningSession[];
  entries: LearningEntry[];
  reflections: Reflection[];
  attempts: Array<{ sessionId: string; correct: number; total: number; createdAt: string }>;
};

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
  /** 학생 기기에 띄울 QR 토큰 발급 (랜덤, 1회용, 60초) */
  issueQrToken(): Promise<{ token: string; expiresAt: string }>;
  /** 교실 단말기(/kiosk)가 읽은 QR 토큰 제출. 유일한 인증 수단 (1회용·60초) */
  submitCodeAuth(deviceId: string, token: string): Promise<AuthEvent>;
  /** 학생 화면: 최근 2분 내 미사용 본인 인증 이벤트 */
  getPendingAuthEvent(): Promise<AuthEvent | null>;
  /** 실제 모드 개발 전용 '인증 건너뛰기' (백엔드 QR 배포 후 제거). mock은 FORBIDDEN, 운영 서버는 404 */
  devSkipAuth(): Promise<AuthEvent>;

  // 세션
  getActiveSession(): Promise<LearningSession | null>;
  startSession(input: { goal: SessionGoal; authEventId: string }): Promise<LearningSession>;
  endSession(sessionId: string, authEventId: string): Promise<LearningSession>;
  getSession(sessionId: string): Promise<LearningSession>;
  /** 교사: 담임이면 자기 반 학생 전체(subject 주면 그 과목만). 교과 교사는 subject 필수, 권한 밖이면 빈 배열 */
  listSessions(filter: { studentId?: string; subject?: string }): Promise<LearningSession[]>;

  // 기록
  addEntry(input: { sessionId: string; kind: EntryKind; content: string; visibility: Visibility }): Promise<LearningEntry>;
  listEntries(sessionId: string): Promise<LearningEntry[]>;
  /** 이 세션에 새 기록이 들어오면 onChange 호출 (실서비스: Realtime, mock: 아무것도 안 함). 돌려준 함수로 구독 해제.
   *  onStatus: 실시간 연결이 되면 "ok", 안 되면 "unavailable" (화면은 그때 주기적으로 다시 불러온다). mock은 부르지 않음 */
  subscribeEntries(sessionId: string, onChange: () => void, onStatus?: (status: RealtimeStatus) => void): () => void;
  /** 학생 본인: 내 모든 세션의 기록(비공개 포함)과 돌아보기 ('내 정리' 탭) */
  listMyNotes(): Promise<{ sessions: LearningSession[]; entries: LearningEntry[]; reflections: Reflection[] }>;

  // AI
  listAiMessages(sessionId: string): Promise<AiMessage[]>;
  askAi(sessionId: string, content: string): Promise<AiMessage>;
  /** 종이 기록 사진(JPEG/PNG data URL, 2MB 이하) → 글자. 본인 ACTIVE 세션·AI 동의 필요. 사진은 저장하지 않음, 글자는 마스킹됨 */
  ocrPaperPhoto(sessionId: string, imageDataUrl: string): Promise<{ text: string }>;
  summarizeSession(sessionId: string): Promise<SessionSummary>;

  // 성찰·피드백
  getReflection(sessionId: string): Promise<Reflection | null>;
  saveReflection(r: Reflection): Promise<Reflection>;
  listFeedback(sessionId: string): Promise<Feedback[]>;
  addFeedback(sessionId: string, content: string): Promise<Feedback>;
  /** 학생 본인 피드백을 읽음으로 (이미 읽었으면 그대로) */
  markFeedbackRead(feedbackId: string): Promise<void>;
  /** 교사가 학생 상세를 열 때 열람 기록. 담임은 자기 반, 교과 교사는 subject 필수(배정·동의 확인 후 audit에 과목 기록) */
  logStudentView(studentId: string, subject?: string): Promise<void>;
  /** 학생: 내 기록 열람 기록 / 교사: 내가 연 기록. 최근 순 */
  listAuditLogs(): Promise<AuditLog[]>;

  // 교과 교사
  /** 내 현재 학기 교과 배정 (교사만) */
  listMyAssignments(): Promise<TeacherAssignment[]>;
  /** 다시 볼 주제 계산용 원자료. 학생 본인만 (교사 호출은 FORBIDDEN) */
  getReviewInputs(studentId: string): Promise<ReviewInputs>;
  /** 이번 주(서울) 반·과목 집계. 현재 학기 배정 없으면 NOT_FOUND. 교과 공유 동의 학생만 들어감 */
  getSubjectSummary(classId: string, subject: string): Promise<SubjectWeekSummary>;
  /** 저장된 이번 주 질문 핵심 요약(없으면 status EMPTY). 교과 배정 없으면 NOT_FOUND. AI 요약·참고용 */
  getQuestionThemes(classId: string, subject: string): Promise<QuestionThemes>;
  /** 새로 만들어 저장. 입력은 기록·교과 공유·AI 동의 + 교사 공개 + 이번 주 + 그 과목 질문만. 질문한 학생 3명 미만이면 FEW */
  generateQuestionThemes(classId: string, subject: string): Promise<QuestionThemes>;
  /** 배정된 반·과목의 교과 공유 동의 학생, 번호순. 배정 없으면 NOT_FOUND */
  listSubjectStudents(classId: string, subject: string): Promise<Student[]>;

  // 교사
  getDashboard(classId: string): Promise<Dashboard>;
  /** 반 분석 원자료: 기간 내 반 학생 세션·질문·응시·주제. 기록 공유 미동의 학생의 질문·응시·주제는 빠짐 */
  getClassAnalytics(classId: string, from: Date, to: Date): Promise<ClassAnalyticsRaw>;

  // 주제 (AI가 기록에서 추출, 반 주제 사전으로 이름 통일)
  /** 본인 ENDED 세션의 주제 1~3개. 근거 없는 주제는 만들지 않음. 결과는 캐시 */
  extractTopics(sessionId: string): Promise<SessionTopic[]>;

  // 주제 테스트 (학생)
  /** 본인 ENDED 세션 + 이번 세션에서 추출된 주제만. 고정 5문항(개념 3 + 적용 2), 정답·해설 없음. 출제 스냅샷 */
  getQuiz(sessionId: string, topicId: string): Promise<{ topic: { id: string; name: string }; questions: StudentQuizQuestion[] }>;
  /** 제출 전에만. 같은 문항의 첫 신고는 AI가 검토(문제 없으면 채점 포함), 다시 신고되면 채점 제외·교사에게. 같은 출제 문항 재신고는 앞 결과 그대로 */
  reportQuestion(sessionId: string, questionId: string, reason: QuizReportReason): Promise<QuizReportOutcome>;
  /** 세션당 1회. 채점 결과(정답·해설 포함)를 돌려준다 */
  submitQuiz(sessionId: string, answers: Record<string, number | null>): Promise<QuizAttempt>;
  /** 학생 본인 / 교사(기록 공유 동의 시) */
  getQuizAttempt(sessionId: string): Promise<QuizAttempt | null>;

  // 주제별 성장·신고 문제
  /** 학생 본인 또는 같은 반 교사. 공유 미동의 학생을 교사가 보면 shared=false */
  getTopicGrowth(studentId: string): Promise<GrowthReport>;
  /** Pace 지수 원자료. 학생 본인 또는 같은 반 교사. '나만 보기' 메모·질문은 빠짐(점수에 안 들어감).
   *  공유 미동의 학생을 교사가 보면 shared=false, 배열은 모두 빈 값 */
  getPaceInputs(studentId: string): Promise<PaceInputsResult>;
  /** 교사: 자기 반 신고 문항 (정답·해설 포함) */
  listReportedQuestions(classId: string): Promise<ReportedQuestion[]>;
  /** 교사: KEEP_EXCLUDED → 풀에서 제외 / DISMISS → 그 응시 재채점 */
  resolveReport(reportId: string, action: "KEEP_EXCLUDED" | "DISMISS"): Promise<void>;

  // 교차채점 (AI 제안 → 교사 확정)
  getRubric(classId: string): Promise<Rubric>;
  getAssessment(sessionId: string): Promise<Assessment | null>;
  requestAiAssessment(sessionId: string): Promise<Assessment>;
  finalizeAssessment(sessionId: string, scores: CriterionScore[]): Promise<Assessment>;
}
