# 단원 테스트 + 교사 종합 보드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학생이 단원을 마칠 때 교사가 승인한 객관식·O/X 문제로 테스트하고, 교사는 단원별 학습 시간·기록·테스트 결과를 한 화면에서 본다.

**Architecture:** 기존 구조 그대로 — `types/domain.ts` 타입 → `api/types.ts` 인터페이스 → `api/mockApi.ts` 규칙 구현(+ `mockApi.test.ts`로 고정) → `features/*` 화면. 채점은 mock API(=서버 역할)가 하고, 학생 응답 전에는 정답·해설을 내려주지 않는다.

**Tech Stack:** React 19, TS, TanStack Query 5, React Router 7, Tailwind 4, Vitest 5

**Spec:** `docs/01-mvp.md` "단원 테스트 + 교사 종합 보드"

## Global Constraints
- 문제 유형: `"MCQ" | "OX"` (주관식 없음). OX 선택지는 정확히 `["O", "X"]`, MCQ는 2~5개
- 학생 출제: `status === "APPROVED"`만, 최대 5문항, 순서 섞음(세션 ID 기반으로 고정 — 새로고침해도 같은 순서)
- 응시: 학생 본인 + `ENDED` 세션 + `goal.unitId` 있음, 세션당 1회
- 차이 신호: 그 단원 최근 세션 이해도 `=== 3` 이고 최근 정답률 `< 0.6` → `"OVERCONFIDENT"`, 그 외 정답률 `< 0.4` → `"LOW_SCORE"`
- 기록 공유(LEARNING_RECORD) 동의가 없으면 교사에게 테스트 결과·기록·이해도 비공개 (학습 횟수·시간만 공개)
- 화면 문구(고정): "테스트는 공부 확인용이에요. 성적에 들어가지 않아요."
- AI 초안은 단원 `standard`(성취기준)를 `evidence`로 가져야 하며, `standard`가 비면 만들지 않음 → `VALIDATION`

## Review Focus
1. 학생이 `getQuiz` 응답으로 정답을 알아냄 → 응답에 `answerIndex`·`explanation`이 없어야 함 (Task 2 테스트)
2. 제출 버튼 두 번 → 두 번째는 `QUIZ_ALREADY_TAKEN` (Task 2 테스트)
3. 단원에 승인 문제 0개 → 빈 퀴즈, 화면은 "아직 준비된 문제가 없어요"로 건너뜀 (Task 2 테스트 + Task 4)
4. 일부 문항 미선택(`null`) 제출 → 허용, 오답 처리 (Task 2 테스트)
5. 기록 공유 철회 학생 → 종합 보드 `shared:false`, 정답률·이해도 `null` (Task 3 테스트)

---

### Task 1: 단원·문제 데이터와 교사 문제 관리 API

**Files:**
- Modify: `frontend/src/types/domain.ts`, `frontend/src/api/types.ts`, `frontend/src/api/mockData.ts`, `frontend/src/api/mockApi.ts`
- Test: `frontend/src/api/mockApi.test.ts` (`describe("단원 문제 관리")`)

**Interfaces (Produces):**
```ts
type Unit = { id: string; classId: string; subject: string; order: number; title: string; standard: string; material?: string };
type QuizQuestion = { id: string; unitId: string; type: "MCQ" | "OX"; prompt: string; choices: string[]; answerIndex: number;
  explanation: string; source: "AI" | "TEACHER"; status: "DRAFT" | "APPROVED"; evidence: string };
// SessionGoal 에 unitId?: string 추가
listUnits(classId: string): Promise<Unit[]>                       // 학생·교사, 자기 반
listUnitQuestions(unitId: string): Promise<QuizQuestion[]>         // 교사만
draftQuestionsWithAi(unitId: string): Promise<QuizQuestion[]>      // 교사만, DRAFT 3개 생성
saveQuestion(q: QuizQuestion): Promise<QuizQuestion>               // 교사만, 신규/수정 (id 없으면 신규)
setQuestionStatus(id: string, status: "DRAFT" | "APPROVED"): Promise<QuizQuestion>
deleteQuestion(id: string): Promise<void>
// Db: units: Unit[]; questions: QuizQuestion[]
```
시드: c1 반 수학(이차함수, 일차부등식), 영어(관계대명사, 현재완료), 국어(설명문 읽기), 과학(화학 반응) + 각 단원 APPROVED 3~5문항. c2 반 단원 1개.

- [ ] **Step 1: 실패 테스트** — `학생은 단원 문제(정답 포함)를 조회할 수 없다`(FORBIDDEN), `AI 초안은 성취기준을 근거로 DRAFT로 만들어진다`(전부 `status==="DRAFT"`, `source==="AI"`, `evidence === unit.standard`), `다른 반 단원 문제는 관리할 수 없다`(NOT_FOUND), `OX 문제는 선택지가 O·X가 아니면 저장할 수 없다`(VALIDATION), `정답 번호가 선택지 범위를 벗어나면 저장할 수 없다`(VALIDATION). 메서드는 stub(빈 배열/입력 그대로 반환)으로 먼저 추가
- [ ] **Step 2: RED 확인** — `npx vitest run src/api` → 위 5개가 기대값 불일치로 실패
- [ ] **Step 3: 구현** — 교사 권한은 기존 `teacher()`·`classId` 비교 재사용, 생성·승인·삭제는 `audit()`
- [ ] **Step 4: GREEN** — `npx vitest run` 전체 통과
- [ ] **Step 5: Commit** `feat(quiz): 단원·문제 데이터와 교사 문제 관리 API`

### Task 2: 학생 단원 테스트 API

**Files:** Modify `domain.ts`, `api/types.ts`, `mockApi.ts` / Test `mockApi.test.ts` (`describe("단원 테스트")`)

**Interfaces:**
- Consumes: Task 1 `Unit`, `QuizQuestion`, `SessionGoal.unitId`
- Produces:
```ts
type StudentQuizQuestion = { id: string; type: "MCQ" | "OX"; prompt: string; choices: string[] };
type QuizResultItem = { questionId: string; prompt: string; choices: string[]; chosen: number | null; answerIndex: number; correct: boolean; explanation: string };
type QuizAttempt = { id: string; sessionId: string; unitId: string; studentId: string; correct: number; total: number; createdAt: string; items: QuizResultItem[] };
getQuiz(sessionId: string): Promise<{ unit: Unit; questions: StudentQuizQuestion[] }>
submitQuiz(sessionId: string, answers: Record<string, number | null>): Promise<QuizAttempt>
getQuizAttempt(sessionId: string): Promise<QuizAttempt | null>   // 학생 본인 / 교사(공유 동의 시)
// ApiErrorCode 추가: "QUIZ_ALREADY_TAKEN" | "QUIZ_NOT_AVAILABLE"
```
- [ ] **Step 1: 실패 테스트** — `퀴즈 응답에는 정답과 해설이 없다`, `승인된 문제만 최대 5개 나온다`, `진행 중 세션이나 단원 없는 세션은 퀴즈를 받을 수 없다`(QUIZ_NOT_AVAILABLE), `미선택 문항은 오답으로 채점된다`, `같은 세션은 한 번만 제출할 수 있다`(QUIZ_ALREADY_TAKEN), `승인 문제가 없으면 빈 퀴즈`, `기록 공유 미동의 학생의 결과는 교사에게 null`
- [ ] **Step 2: RED 확인**
- [ ] **Step 3: 구현** — 출제 선택은 `approved.sort(by hash(sessionId+qid)).slice(0,5)`로 결정적. `submitQuiz`는 같은 선택 집합으로 채점
- [ ] **Step 4: GREEN**
- [ ] **Step 5: Commit** `feat(quiz): 학생 단원 테스트 출제·채점 API`

### Task 3: 교사 종합 보드 API

**Files:** Modify `domain.ts`, `api/types.ts`, `mockApi.ts` / Test `mockApi.test.ts` (`describe("종합 보드")`)

**Interfaces:**
```ts
type UnitOverview = { unitId: string; subject: string; title: string; sessions: number; minutes: number;
  entries: number | null; questions: number | null; lastQuizRate: number | null; lastUnderstanding: 1 | 2 | 3 | null;
  signal: "OVERCONFIDENT" | "LOW_SCORE" | null };
type StudentOverview = { studentId: string; shared: boolean; units: UnitOverview[]; noUnit: { sessions: number; minutes: number } };
getStudentOverview(studentId: string): Promise<StudentOverview>   // 교사만, 자기 반, audit
// DashboardRow 에 lastQuizRate: number | null 추가 (공유 동의 없으면 null)
```
- [ ] **Step 1: 실패 테스트** — `이해도 3인데 정답률 60% 미만이면 OVERCONFIDENT`, `정답률 40% 미만이면 LOW_SCORE`, `공유 미동의면 시간·횟수만 보이고 나머지는 null`, `학생은 종합 보드를 볼 수 없다`(FORBIDDEN)
- [ ] **Step 2: RED 확인** / **Step 3: 구현** / **Step 4: GREEN**
- [ ] **Step 5: Commit** `feat(quiz): 교사 학생 종합 보드 API`

### Task 4: 학생 화면 (단원 선택·테스트·결과)

**Files:**
- Modify: `features/session/StartPage.tsx` (과목 선택 후 `listUnits` 필터해 단원 라디오, "단원 없음" 포함)
- Create: `features/session/UnitQuiz.tsx` (`{ sessionId, onDone }` — "이 단원을 다 공부했어요" 체크 → 문제 → 제출 → 정답·해설 → 돌아보기로)
- Modify: `features/session/EndPage.tsx` (Wrapup 앞에 `goal.unitId` 있으면 UnitQuiz 단계, "나중에 할게요")
- Modify: `features/records/MyRecordsPage.tsx`, `SessionDetail.tsx` (단원명, 테스트 결과)

- [ ] **Step 1:** `npx tsc -b --noEmit` 통과
- [ ] **Step 2: 브라우저 확인** — 학생 1번: 수학·이차함수로 시작 → 종료 → 테스트 5문항 → 제출 → 정답·해설 → 돌아보기 저장 → 내 기록에 "3/5" 표시. 승인 문제 0개 단원은 건너뜀 문구
- [ ] **Step 3: Commit** `feat(quiz): 학생 단원 선택·테스트 화면`

### Task 5: 교사 화면 (문제 관리·종합 보드)

**Files:**
- Create: `features/teacher/UnitsPage.tsx` (`/teacher/units`: 단원 목록 → 문제 목록, AI 초안 만들기(근거 표시), 수정·승인·삭제)
- Create: `features/teacher/StudentOverviewBoard.tsx` (StudentDetailPage 상단, 단원별 표 + 신호 배지, `shared:false`면 안내)
- Modify: `routes.tsx`, `components/Layout.tsx`(교사 메뉴 "단원 문제"), `ClassDashboard.tsx`("최근 테스트" 열)

- [ ] **Step 1:** `npx tsc -b --noEmit` 통과
- [ ] **Step 2: 브라우저 확인** — 교사: 단원 문제 → AI 초안 3개(근거 문장 보임) → 1개 수정·승인 → 학생 화면에 출제됨. 학생 상세 종합 보드에서 Task 4 결과(정답률)와 신호 확인
- [ ] **Step 3: Commit** `feat(quiz): 교사 단원 문제 관리·종합 보드 화면`

### Task 6: 명세·마무리

- [ ] `docs/api-spec.md` v0.4 절 추가 (엔드포인트·테이블·규칙), `frontend/README.md` 데모 흐름 갱신
- [ ] `npx vitest run`, `npx tsc -b --noEmit`, `npx vite build` 통과, 빌드 결과물 비밀키 검색 0건
- [ ] Commit `docs: 단원 테스트 API 명세 v0.4`
