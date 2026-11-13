# 교사 반 분석 + 학생 종합 프로필 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 교사가 반 전체 평균·분포와 학생별 학습 방식(AI 질문 횟수·유형·원문)을 한눈에 보는 '반 분석' 화면과 학생 종합 프로필을 만든다.

**Architecture:** 새 Api `getClassAnalytics`가 기간 내 반의 원자료(세션·학생 AI 질문·응시·세션 주제·공유 여부)를 한 번에 가져오고, 순수 함수 `summarizeClass`가 집계한다. 질문 유형은 순수 함수 `classifyQuestion`(규칙)로 나눈다. 화면 두 곳(반 분석, 학생 상세 위 프로필)이 같은 쿼리 결과를 쓴다.

**Tech Stack:** React 19, react-router 7, @tanstack/react-query 5, supabase-js 2.119.0, vitest 5, tailwindcss 4. 새 의존성 없음.

**Spec:** `docs/01-mvp.md` "교사 반 분석 + 학생 종합 프로필 (2026-11-14)"

## Global Constraints

- 백엔드 수정 없음. 실제 모드는 기존 view·RPC만 사용(RLS 그대로).
- 새 라이브러리 금지. 차트는 CSS 막대.
- 질문 유형 화면 표시 옆에 "자동 분류 · 참고용" 문구.
- 기록 공유 미동의 학생: 질문·정답률·유형 집계에서 제외, 화면에 "기록 비공개 n명 제외". 학습 횟수·시간은 포함.
- 순위·등수 표시 금지. 학생 목록 기본 정렬은 번호순.
- 기간: 최근 7일 / 최근 4주, 기본 4주.
- 유형 라벨: `CONCEPT` 개념 이해, `CHECK` 풀이 확인, `ANSWER` 답 요청, `OTHER` 기타.

## Review Focus

1. 응시가 하나도 없는 반(실제 모드 지금 상태) → 정답률 카드·분포가 "-"로, NaN·0% 표시 없음. (Task 2 테스트)
2. 미동의 학생이 질문 0건이라 "질문 0회"로 평균을 끌어내림 → 분포·평균 분모에서 빠져야 함. (Task 2 테스트)
3. `total = 0` 응시(전부 신고) → 정답률 계산에서 제외. (Task 2 테스트)
4. 세션 0개 반·학생 → 빈 상태 문구, 오류 없음. (Task 2 테스트, Task 4·5 화면 확인)
5. 질문 원문에 HTML 같은 문자열 → 텍스트로만 표시(React 기본 이스케이프, `dangerouslySetInnerHTML` 금지). (Task 5 리뷰)

---

### Task 1: 질문 유형 분류

**Files:**
- Create: `frontend/src/lib/questionType.ts`
- Test: `frontend/src/lib/questionType.test.ts`

**Interfaces:**
- Produces: `export type QuestionType = "CONCEPT" | "CHECK" | "ANSWER" | "OTHER"`, `export const QUESTION_TYPE_LABEL: Record<QuestionType, string>`, `export function classifyQuestion(text: string): QuestionType`

- [ ] **Step 1: 실패 테스트** — `classifyQuestion`이 stub(`return "OTHER"`)인 상태에서 각 동작 하나씩:
  - `"꼭짓점 답 알려줘"` → `"ANSWER"`, `"정답이 뭐야?"` → `"ANSWER"`, `"그냥 풀이 보여줘"` → `"ANSWER"`
  - `"이렇게 풀었는데 맞아?"` → `"CHECK"`, `"x=3 나왔는데 확인해줘"` → `"CHECK"`
  - `"왜 -b/2a 이야?"` → `"CONCEPT"`, `"꼭짓점은 어떻게 구해?"` → `"CONCEPT"`, `"완전제곱식이 뭐야?"` → `"CONCEPT"`
  - 우선순위: `"왜 답이 3이야? 그냥 답 알려줘"` → `"ANSWER"`, `"왜 그런지 이렇게 풀었는데 맞아?"` → `"CHECK"`
  - `"안녕"` → `"OTHER"`, `""` → `"OTHER"`, `"   "` → `"OTHER"`
- [ ] **Step 2:** `npx vitest run src/lib/questionType.test.ts` → 기대값 불일치로 FAIL 확인(RED 기록)
- [ ] **Step 3: 구현** — 공백 정리 후 ANSWER → CHECK → CONCEPT 순서로 키워드 포함 검사. 키워드 목록은 구현자 선택(위 테스트를 모두 만족).
- [ ] **Step 4:** 같은 명령 PASS
- [ ] **Step 5: Commit** `feat(teacher): 질문 유형 규칙 분류`

### Task 2: 반 집계 순수 함수

**Files:**
- Modify: `frontend/src/types/domain.ts` (끝에 타입 추가)
- Create: `frontend/src/lib/analytics.ts`
- Test: `frontend/src/lib/analytics.test.ts`

**Interfaces:**
- Consumes: Task 1 `classifyQuestion`, `QuestionType`
- Produces (domain.ts):
  ```ts
  export type ClassAnalyticsRaw = {
    classId: string; from: string; to: string;
    students: Array<{ studentId: string; name: string; number: number; shared: boolean }>;
    sessions: LearningSession[];               // 기간 내 반 학생 세션(공유 여부 무관)
    questions: Array<{ id: string; sessionId: string; studentId: string; content: string; createdAt: string }>; // 학생이 AI에 보낸 메시지, 공유 학생만
    attempts: Array<{ sessionId: string; studentId: string; topicId: string; correct: number; total: number; createdAt: string }>;
    sessionTopics: Array<{ sessionId: string; topicId: string; name: string }>;
  };
  ```
- Produces (analytics.ts):
  ```ts
  export type Distribution = { mean: number | null; median: number | null; buckets: Array<{ label: string; count: number }> };
  export type StudentStat = { studentId: string; name: string; number: number; shared: boolean;
    sessionCount: number; minutes: number;
    questionCount: number | null; quizRate: number | null;
    types: Record<QuestionType, number> | null; mainType: QuestionType | null };
  export type ClassAnalytics = { students: StudentStat[]; excludedCount: number;
    minutes: Distribution; quizRate: Distribution; questions: Distribution;
    types: Record<QuestionType, number>;
    topTopics: Array<{ topicId: string; name: string; studentCount: number; avgRate: number | null }> };
  export function summarizeClass(raw: ClassAnalyticsRaw): ClassAnalytics;
  ```
- 구간(고정): 학습 분 `["0", "1~59분", "1~3시간", "3~5시간", "5시간+"]`(경계 0 / <60 / <180 / <300 / ≥300), 정답률 `["0~19%", "20~39%", "40~59%", "60~79%", "80~100%"]`, 질문 수 `["0", "1~3", "4~7", "8~12", "13+"]`.
- 규칙: `minutes`·`sessionCount`는 모든 학생(ACTIVE 세션은 `durationMinutes ?? 0`). `questionCount`·`types`·`mainType`은 공유 학생만(미공유는 `null`). `quizRate` = 기간 내 `total>0` 응시의 Σcorrect/Σtotal, 없으면 `null`, 미공유는 `null`. 분포는 `null` 아닌 값만으로, 값이 없으면 mean·median `null`, 구간 count 0. `mainType`은 최다 유형(동률이면 ANSWER>CHECK>CONCEPT>OTHER), 질문 0이면 `null`. `topTopics`는 주제별 공부한 공유 학생 수 내림차순 최대 5, `avgRate`는 그 주제 응시의 Σcorrect/Σtotal(없으면 `null`). `excludedCount` = 미공유 학생 수. 학생 목록은 번호순.

- [ ] **Step 1: 실패 테스트** (stub은 빈 값 반환) — 각각 별도 `it`:
  - 빈 반(`students: []`): 모든 mean `null`, `topTopics: []`, `excludedCount: 0`
  - 학생 2명, 세션 90분·30분 → `minutes.mean === 60`, `median === 60`, 구간 `"1~59분"` 1·`"1~3시간"` 1
  - 미공유 학생: 질문·응시가 있어도 `questionCount === null`, `quizRate === null`, `questions` 분포에서 제외, `excludedCount === 1`, `minutes`에는 포함
  - 응시 없음 → `quizRate.mean === null`(NaN 아님)
  - `total: 0` 응시만 → 그 학생 `quizRate === null`
  - 응시 2건 (3/5, 4/5) → `quizRate === 0.7`
  - 질문 3개(ANSWER 2, CONCEPT 1) → `types.ANSWER === 2`, `mainType === "ANSWER"`, 반 `types` 합계에 반영
  - topTopics: 주제 A를 2명, B를 1명 → `[A, B]` 순, A의 `avgRate`
- [ ] **Step 2:** `npx vitest run src/lib/analytics.test.ts` → FAIL 확인(RED 기록)
- [ ] **Step 3: 구현** `summarizeClass` in `lib/analytics.ts`
- [ ] **Step 4:** PASS
- [ ] **Step 5: Commit** `feat(teacher): 반 분석 집계`

### Task 3: Api `getClassAnalytics` (mock + 실제) + mock 시드 질문

**Files:**
- Modify: `frontend/src/api/types.ts` (Api 인터페이스, 교사 영역)
- Modify: `frontend/src/api/mockApi.ts`, `frontend/src/api/mockData.ts`
- Modify: `frontend/src/api/supabaseApi.ts`
- Test: `frontend/src/api/mockApi.test.ts`

**Interfaces:**
- Produces: `getClassAnalytics(classId: string, from: Date, to: Date): Promise<ClassAnalyticsRaw>`
- mock 규칙: 교사 본인 반만(아니면 `NOT_FOUND`), 학생 호출 `FORBIDDEN`. `startedAt`이 [from, to] 안인 세션. `shared = sharedWithTeacher(id)`. 미공유 학생의 questions·attempts·sessionTopics는 빼고 넣음.
- mock 시드: `createSeed`에서 반 c1 학생 일부(4번 AI 미동의 학생 제외)의 기존 세션에 학생 AI 메시지를 넣는다. 네 유형이 모두 나오고 학생마다 0~12개로 차이가 나게(예문은 Task 1 테스트 문장 계열). AI 답 메시지도 짝으로 넣는다.
- 실제 모드: `v_students`(classId) → `student_topic_growth`를 학생마다 병렬 호출해 `shared`만 사용 → `v_sessions` `.in("studentId", ids).gte("startedAt", fromIso).lte("startedAt", toIso)` → 세션 id로 `v_ai_messages`(`role !== "ai"`만), `v_quiz_attempts`, `v_session_topics` `.in("sessionId", ids)`. 세션 0개면 뒤 세 조회 생략. 미공유 학생 행은 클라이언트에서도 한 번 더 걸러 넣음.

- [ ] **Step 1: 실패 테스트** (mock, stub은 빈 raw 반환):
  - 교사 t1, 4주 범위 → `students.length === 30`, 시드 질문 있음(`questions.length > 0`)
  - 범위 밖 세션 제외: 범위를 미래 하루로 → `sessions.length === 0`
  - 미공유 학생: s05로 로그인해 `LEARNING_RECORD` 거부 저장 후 t1 조회 → s05 `shared === false`, s05 질문·응시·주제 없음 (mock 시드엔 미공유 학생이 없음)
  - 다른 반 교사 → `NOT_FOUND`, 학생 → `FORBIDDEN`
- [ ] **Step 2:** `npx vitest run src/api/mockApi.test.ts -t "반 분석"` → FAIL 확인
- [ ] **Step 3:** mock 구현 + 시드, 실제 어댑터 구현
- [ ] **Step 4:** PASS, `npx vitest run`(전체) PASS, `npx tsc -b --noEmit` 오류 없음
- [ ] **Step 5: Commit** `feat(api): 반 분석 원자료 조회`

### Task 4: 반 분석 화면

**Files:**
- Create: `frontend/src/features/teacher/AnalyticsPage.tsx`
- Modify: `frontend/src/routes.tsx` (`/teacher/analytics`), `frontend/src/components/Layout.tsx` (교사 메뉴 "반 분석", 대시보드 다음)

**Interfaces:**
- Consumes: `api.getClassAnalytics`, `summarizeClass`, `QUESTION_TYPE_LABEL`
- Produces: `export function useClassAnalytics(range: "7d" | "4w")` (같은 파일에서 export, Task 5가 사용) — react-query key `["class-analytics", classId, range]`, `to = now`, `from = now - 7일 | 28일`, 반환 `{ raw, summary }`.

- [ ] **Step 1:** 화면 구성: 기간 토글(7일/4주) · 카드 3개(평균, 중앙값, 5구간 CSS 막대; 값 없으면 "-") · "기록 비공개 n명 제외" · 주제 TOP 5 표 · 반 질문 유형 비율 막대 + "자동 분류 · 참고용" · 학생 표(번호, 이름, 학습 시간, 정답률, AI 질문 수, 주로 한 질문; 미공유는 "비공개"), 행 클릭 → `/teacher/students/:studentId`. 로딩 `Spinner`, 오류 `ErrorState`, 세션 0이면 `EmptyState`.
- [ ] **Step 2:** `npx tsc -b --noEmit` 오류 없음
- [ ] **Step 3: mock 브라우저 확인** (`frontend-demo-alt`, 5175): 교사 로그인 → 반 분석 → 카드 3개 값·막대, 유형 비율, TOP 5, 4번 학생(AI 미동의)은 질문 0. 미공유 표시는 학생 하나를 mock에서 기록 공유 거부로 바꾼 뒤 "비공개" 확인. 콘솔 오류 없음. 스크린샷.
- [ ] **Step 4: Commit** `feat(teacher): 반 분석 화면`

### Task 5: 학생 종합 프로필

**Files:**
- Create: `frontend/src/features/teacher/StudentProfile.tsx`
- Modify: `frontend/src/features/teacher/StudentDetailPage.tsx` (PageTitle 아래, TopicGrowthView 위에 `<StudentProfile studentId=… />`; 학습 목록 버튼에 "AI 질문 n회")

**Interfaces:**
- Consumes: Task 4 `useClassAnalytics("4w")`, `ClassAnalytics`, `classifyQuestion`

- [ ] **Step 1:** 프로필 카드: 학습 횟수·시간, 최근 4주 정답률, AI 질문 수 — 각 옆에 반 평균과 ▲/▼(같으면 표시 없음, 값 없으면 "-"). 질문 유형 비율 막대 + "자동 분류 · 참고용". 질문 원문 목록(최근 순, 유형 배지, 그 세션의 `goalLabel`, 최대 20개 + "더 보기"). 미공유 학생은 "기록 공유에 동의하지 않아 질문·정답률은 보이지 않아요"만.
- [ ] **Step 2:** `npx tsc -b --noEmit` 오류 없음
- [ ] **Step 3: mock 브라우저 확인**: 질문 많은 학생 상세 → 프로필 값·평균 비교·원문 목록, 학습 목록 "AI 질문 n회"; 기록 공유 거부로 바꾼 학생 → 비공개 문구. 스크린샷.
- [ ] **Step 4: Commit** `feat(teacher): 학생 종합 프로필`

### Task 6: 마무리 검증

- [ ] `npx vitest run` 전체 PASS, `npx tsc -b --noEmit`, `npx vite build` 통과
- [ ] 실제 모드(`frontend`, 교사 로그인은 사용자): 반 분석 화면 오류 없이 열림, 네트워크 요청 수 확인(학생 수 + 4~5회), 응시 없으면 "-"
- [ ] 독립 리뷰 서브에이전트(Opus)로 브랜치 diff 리뷰 → 지적 반영
- [ ] `security-check`, `docs/PROJECT_LOG.md` 추가, 커밋
