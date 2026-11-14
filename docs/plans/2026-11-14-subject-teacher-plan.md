# 과목 라벨 · 과목별 다시 볼 주제 · 교과 교사 열람 — 구현 계획

> **에이전트 작업자용:** superpowers:subagent-driven-development(권장) 또는 superpowers:executing-plans로 작업 단위로 진행한다. 단계는 체크박스(`- [ ]`)로 추적한다.

**목표:** 학생에게 `과목 - 다시 볼 주제`를 보여 주고, 교과 교사가 맡은 반·과목의 주간 집계와 동의 학생의 그 과목 기록만 보고 피드백하게 한다(mock 데모 우선, 백엔드는 요청서).

**구조:** 규칙은 순수 함수(`lib/schoolCalendar.ts`, `lib/topicSignal.ts`, `lib/subjectAccess.ts`, `lib/reviewTopics.ts`, `lib/subjectSummary.ts`)에 두고 mock API가 그대로 쓴다. 실제 모드는 `FEATURES.subjectTeacher = USE_MOCK`으로 숨기고, 서버 규칙은 `docs/backend/2026-11-14-backend-request-v0.9.md`로 넘긴다. 화면은 Figma v2 컴포넌트를 재사용한다.

**기술:** React 18 + Vite + TypeScript, TanStack Query, react-router, vitest. 새 의존성 없음.

**기획(승인):** `docs/01-mvp.md` 마지막 절, `docs/00-review.md`, `docs/02-scenarios.md`, `docs/03-erd.md`, `docs/05-data-flow.md`, `docs/07-test-strategy.md`, `docs/decisions.md`(#1~#16).

## 전체 제약
- 과목 목록은 `SUBJECTS`(`lib/checklists.ts`): 국어·수학·영어·사회·과학·기타. "기타"는 교과 교사 배정·열람 없음.
- 교과 교사 열람 조건 = 현재 학기 배정(교사, 학생 반, 학습 `goal.subject`) AND `LEARNING_RECORD` 동의 AND `SUBJECT_SHARE` 동의 AND 기록 `visibility === "TEACHER"`(기록 내용에 한함).
- 현재 학기: 서울 날짜 3~8월 `YYYY-1`, 9~12월 `YYYY-2`, 1~2월 `(YYYY-1)-2`.
- 주 = 서울 월요일 00:00 ~ 일요일 23:59.
- 신호: `SIGNAL_MIN_TOTAL = 3`. `understanding === 3 && rate < 0.6` → `OVERCONFIDENT`, 아니면 `rate < 0.4` → `LOW_SCORE`. 신호·정답률은 (주제, 학습 과목) 단위.
- "적음": 학생 수 칸이 1~2면 숫자 대신 `"적음"`(0은 0). 학습 학생 ≤ 2면 카드 전체 `"이번 주 기록 적음"`. 문항 정답률은 응시 학생 3명 이상만.
- 담임 = `user.role === "teacher" && user.classId !== ""`. 교과만 맡은 교사는 `classId: ""`(타입은 `string` 그대로).
- 알림(메일·푸시) 없음. 지난주 비교 없음. 해설 링크 없음.
- 새 CSS 클래스 접두사 `subj-`(학생·교사 공통). 범용 이름 금지.
- 문구는 단정하지 않는다: "다시 볼 주제", "다시 볼 후보". "부족" 금지.
- `.env` 등 비밀 파일 읽지 않기. `import.meta.env`가 든 코드는 Edit/Write로만.
- TDD는 동작 하나씩: 테스트 하나 → 실패 확인 → 구현 → 통과. 보고에 동작마다 `RED: <테스트 이름> → <실패 메시지 한 줄>`을 쓴다. import·컴파일 오류나 없는 이름으로 난 실패는 RED가 아니다. stub을 먼저 두고 기대값 불일치로 실패하는 것을 본다.
- 리뷰 지적·버그를 고칠 때는 같은 원인·패턴의 문제를 같은 모듈과 같은 입력 경로에서 찾아 함께 고친다. 보고에 `같은 종류 검색: <검색어·확인한 경로> → 찾음 N, 고침 M, 남김(이유)`을 쓴다.

## 리뷰 초점 (테스트가 놓치기 쉬운 것)
1. 교과 교사가 **주소를 직접 입력**해 다른 과목·다른 반 학생 상세·세션에 들어감 → 빈 결과/NOT_FOUND (Task 6 통합 테스트 `교과 교사는 다른 과목 세션을 getSession으로 못 본다`).
2. 학생이 **`LEARNING_RECORD`를 끄고 `SUBJECT_SHARE`만 남은** 상태 → 교과 교사에게 안 보임 (Task 3 결정표 행, Task 6 통합 테스트).
3. **담임 겸 교과 교사**가 자기 반은 전체, 다른 반은 과목만 → 둘이 섞이지 않음 (Task 3, Task 6).
4. **주 경계**: 일요일 23:59 서울 학습은 그 주, 월 00:00은 다음 주(UTC로는 전날 15:00) (Task 1).
5. **AI 미동의·주제 없음 학습**이 집계에서 오류 없이 "주제 없음"으로 셈 (Task 5).

---

### Task 1: 학기·주 계산

**파일:**
- 만들기: `frontend/src/lib/schoolCalendar.ts`
- 테스트: `frontend/src/lib/schoolCalendar.test.ts`

**인터페이스:**
- 제공: `currentTerm(now: Date): string`, `seoulWeekStart(now: Date): string`(월요일 `YYYY-MM-DD`), `isInSeoulWeek(iso: string, weekStart: string): boolean`. 날짜 키는 `lib/pace.ts`의 `seoulDateKey`를 쓴다.

- [ ] 테스트: `currentTerm` — `2026-03-01T00:00+09:00`→`"2026-1"`, `2026-08-31T23:59+09:00`→`"2026-1"`, `2026-09-01T00:00+09:00`→`"2026-2"`, `2027-02-28T12:00+09:00`→`"2026-2"`, `2026-02-28T15:30:00Z`(서울 3/1 00:30)→`"2026-1"`.
- [ ] 테스트: `seoulWeekStart` — `2026-11-14T12:00+09:00`(토)→`"2026-11-09"`, `2026-11-15T23:59+09:00`(일)→`"2026-11-09"`, `2026-11-15T15:00:00Z`(서울 월 00:00)→`"2026-11-16"`.
- [ ] 테스트: `isInSeoulWeek("2026-11-15T14:59:00Z", "2026-11-09") === true`, `isInSeoulWeek("2026-11-15T15:00:00Z", "2026-11-09") === false`.
- [ ] 각 테스트 RED 확인(stub이 `""`/`false` 반환) → 구현 → `npx vitest run src/lib/schoolCalendar.test.ts` 통과.
- [ ] 커밋 `feat: 학기·서울 주 계산 함수`

### Task 2: 신호 규칙 분리 (리팩터)

**파일:**
- 만들기: `frontend/src/lib/topicSignal.ts`, `frontend/src/lib/topicSignal.test.ts`
- 수정: `frontend/src/api/mockApi.ts:56`(`SIGNAL_MIN_TOTAL`), `:398-403`(`quizSignal`) → import로 교체. `supabaseApi.ts`/`supabaseMappers.ts`에 같은 규칙이 있으면 같이 교체.

**인터페이스:**
- 제공: `SIGNAL_MIN_TOTAL = 3`, `quizSignal(rate: number | null, understanding: number | null, total?: number): TopicGrowth["signal"]`(동작은 지금과 같음).

- [ ] 테스트(현재 동작 고정): `quizSignal(0.5, 3, 5) === "OVERCONFIDENT"`, `quizSignal(0.6, 3, 5) === null`, `quizSignal(0.2, 1, 5) === "LOW_SCORE"`, `quizSignal(0.2, 1, 2) === null`, `quizSignal(null, 3, 5) === null`.
- [ ] 옮긴 뒤 `npx vitest run` 전체 통과(기존 277+ 유지).
- [ ] 커밋 `refactor: 주제 신호 규칙을 lib/topicSignal로`

### Task 3: 교과 교사 권한 판단

**파일:**
- 만들기: `frontend/src/lib/subjectAccess.ts`, `frontend/src/lib/subjectAccess.test.ts`
- 수정: `frontend/src/types/domain.ts` — `ConsentKind`에 `"SUBJECT_SHARE"` 추가, `export type TeacherAssignment = { teacherId: string; classId: string; subject: string; term: string }`.

**인터페이스:**
- 소비: Task 1 `currentTerm`.
- 제공:
  - `isHomeroomTeacher(t: User, studentClassId: string): boolean`
  - `activeAssignments(all: TeacherAssignment[], teacherId: string, now: Date): TeacherAssignment[]`
  - `subjectShareActive(c: { learningRecord: boolean; subjectShare: boolean }): boolean`
  - `canSubjectTeacherSee(i: { assignments: TeacherAssignment[]; teacherId: string; studentClassId: string; sessionSubject: string; consents: { learningRecord: boolean; subjectShare: boolean }; now: Date }): boolean`

- [ ] 결정표 테스트 `canSubjectTeacherSee` (now = `2026-11-14T12:00+09:00`, 배정 `{t3, c1, 수학, 2026-2}`): 같은 반·수학·둘 다 동의 → true / 다른 과목 국어 → false / 다른 반 c2 → false / "기타" → false / `subjectShare` false → false / `learningRecord` false·`subjectShare` true → false / 배정 term `2026-1` → false / 배정 없음 → false.
- [ ] 테스트 `isHomeroomTeacher`: `{role:"teacher", classId:"c1"}`·c1 → true, `classId:""`·c1 → false, 학생 → false.
- [ ] 각 RED → 구현 → 통과.
- [ ] 커밋 `feat: 교과 교사 권한 판단 함수`

### Task 4: 과목별 다시 볼 주제

**파일:**
- 만들기: `frontend/src/lib/reviewTopics.ts`, `frontend/src/lib/reviewTopics.test.ts`
- 수정: `frontend/src/types/domain.ts` — 아래 타입.

**인터페이스:**
- 소비: Task 2 `quizSignal`, `SIGNAL_MIN_TOTAL`.
- 제공:
  - `export type ReviewInputs = { sessions: Array<{ id: string; subject: string; startedAt: string }>; sessionTopics: Array<{ sessionId: string; topicId: string; name: string }>; attempts: Array<{ sessionId: string; topicId: string; correct: number; total: number; createdAt: string }>; reflections: Array<{ sessionId: string; understanding: 1 | 2 | 3 | null }> }`
  - `export type ReviewTopic = { topicId: string; name: string; signal: "LOW_SCORE" | "OVERCONFIDENT"; lastRate: number; lastAt: string }`
  - `export type SubjectReview = { subject: string; topics: ReviewTopic[] }`
  - `reviewTopicsBySubject(i: ReviewInputs): SubjectReview[]` — (주제, 학습 과목)마다 그 과목 학습의 **마지막 응시**와 같은 세션 이해도로 `quizSignal`. 신호 있는 것만, 과목 안 최근 순 최대 3개, 과목은 `SUBJECTS` 순서, 주제 없는 과목은 빼고 반환.
  - `sessionReviewLine(subject: string, topicName: string, correct: number, total: number): string | null` — 마치기 화면용. `total >= 3 && correct/total < 0.4`면 `` `${subject} - ${topicName}` ``, 아니면 null.

- [ ] 테스트 `같은 주제라도 과목별로 따로 판단한다`: 주제 T가 수학 학습(1/5)과 국어 학습(5/5)에 있음 → 수학에 T(LOW_SCORE), 국어 없음.
- [ ] 테스트 `채점 문항 3개 미만은 빼고, 과목당 최근 3개만`.
- [ ] 테스트 `이해도 3인데 60% 미만이면 OVERCONFIDENT`.
- [ ] 테스트 `sessionReviewLine("수학","이차함수 그래프",1,5) === "수학 - 이차함수 그래프"`, `(…,1,2) === null`, `(…,2,5) === null`.
- [ ] 각 RED → 구현 → 통과. 커밋 `feat: 과목별 다시 볼 주제 계산`

### Task 5: 반·과목 주간 집계

**파일:**
- 만들기: `frontend/src/lib/subjectSummary.ts`, `frontend/src/lib/subjectSummary.test.ts`
- 수정: `frontend/src/types/domain.ts` — 아래 타입.

**인터페이스:**
- 소비: Task 1 `isInSeoulWeek`, Task 4 `ReviewInputs`·`reviewTopicsBySubject`.
- 제공:
  - `export type CountCell = number | "적음"`
  - `export type SubjectWeekSummary = { classId: string; subject: string; weekStart: string; few: boolean; sessionCount: number; studentCount: CountCell; topics: Array<{ topicId: string | null; name: string; studentCount: CountCell; reviewCount: CountCell; lastRate: number | null }>; hardQuestions: Array<{ questionId: string; prompt: string; rate: number; answered: number }> }` — `topicId: null`·`name: "주제 없음"`이 주제 없는 학습.
  - `export type SubjectSummaryInputs = ReviewInputs & { students: Array<{ studentId: string }>; sessionOwners: Array<{ sessionId: string; studentId: string }>; items: Array<{ sessionId: string; questionId: string; prompt: string; correct: boolean; reported: boolean }> }` — 이미 동의·과목·반으로 걸러진 행만 들어온다고 가정.
  - `subjectWeekSummary(classId: string, subject: string, weekStart: string, i: SubjectSummaryInputs): SubjectWeekSummary`
  - `fewCell(n: number): CountCell` — 1~2 → `"적음"`, 그 외 숫자.

- [ ] 테스트 `학습 학생 2명 이하면 few=true`, `3명이면 숫자`.
- [ ] 테스트 `주제별 후보 수 1~2명은 적음, 0은 0`.
- [ ] 테스트 `주제 없는 학습은 '주제 없음' 행으로 센다`.
- [ ] 테스트 `주 밖 학습은 빠진다`(Task 1 경계값 재사용).
- [ ] 테스트 `많이 틀린 문항은 신고 문항 제외, 응시 3명 이상, 정답률 낮은 순 2개`.
- [ ] 각 RED → 구현 → 통과. 커밋 `feat: 반·과목 주간 집계`

### Task 6: API 계약과 mock

**파일:**
- 수정: `frontend/src/types/domain.ts`(`Feedback.authorSubject?: string | null`, `AuditLog.subject?: string | null`), `frontend/src/api/types.ts`(`Api`), `frontend/src/api/index.ts`(`FEATURES.subjectTeacher: USE_MOCK`), `frontend/src/api/mockData.ts`(시드), `frontend/src/api/mockApi.ts`, `frontend/src/api/supabaseApi.ts`(새 메서드는 `throw new ApiError("UNKNOWN", "subject teacher not deployed")`), `docs/api-spec.md`.
- 테스트: `frontend/src/api/mockApi.test.ts`

**인터페이스 (Api에 추가·변경):**
- `listMyAssignments(): Promise<TeacherAssignment[]>` — 현재 학기만.
- `getReviewInputs(studentId: string): Promise<ReviewInputs>` — 학생 본인만(교사 호출은 FORBIDDEN).
- `getSubjectSummary(classId: string, subject: string): Promise<SubjectWeekSummary>` — 이번 주. 배정 없으면 NOT_FOUND.
- `listSubjectStudents(classId: string, subject: string): Promise<Student[]>` — 동의(`subjectShareActive`) 학생만, 번호순.
- `listSessions(filter: { studentId?: string; subject?: string })` — `subject` 추가. 교과 교사는 `subject` 필수, 권한 밖이면 빈 배열.
- `logStudentView(studentId: string, subject?: string)` — 교과 교사는 audit에 `subject` 기록.
- `addFeedback` — 작성자가 그 학생의 담임이 아니면 `authorSubject = session.goal.subject`, 담임이면 null.
- mock 내부: `visibleSession`이 담임 조건 OR `canSubjectTeacherSee`. 교과 교사 경로의 `listEntries`/`getReflection`/`listFeedback`/`getQuizAttempt`는 같은 `visibleSession`을 탄다(TEACHER 기록만, 기존 `teacherEntries`).
- 시드: `{ id: "t3", name: "오수학", role: "teacher", classId: "" }` + 배정 `{t3,c1,수학}`, `{t3,c2,수학}`; t1(한담임)에 `{t1,c2,국어}`; term은 `currentTerm(new Date())`. c1 학생 일부(김가온 포함)에 `SUBJECT_SHARE` 동의, 이나래는 없음. 김가온에게 이번 주 수학·국어 학습 각 1개 이상. 데모 로그인 목록에 오수학 표시.

- [ ] 통합 테스트(동작 하나씩 RED → 구현): `교과 교사는 맡은 과목 세션만 본다`, `다른 과목 세션을 getSession으로 못 본다(NOT_FOUND)`, `다른 반 학생 세션을 못 본다`, `SUBJECT_SHARE 미동의 학생은 목록·집계에 없다`, `LEARNING_RECORD를 끄면 SUBJECT_SHARE가 있어도 안 보인다`, `PRIVATE 기록은 교과 교사에게 안 보인다`, `담임 겸 교과 교사는 자기 반 전체·다른 반 과목만`, `교과 교사 피드백에 authorSubject가 붙고 담임·학생이 본다`, `교과 교사 열람 기록에 subject가 남는다`, `getReviewInputs는 학생 본인만`.
- [ ] `docs/api-spec.md`에 새 메서드·필드 추가.
- [ ] `npx vitest run`, `npx tsc -b --noEmit` 통과. 커밋 `feat: 교과 교사 API 계약과 mock`

### Task 7: 학생 화면

**파일:**
- 수정: `frontend/src/features/consent/ConsentPage.tsx`(항목 추가), `frontend/src/features/session/TopicQuiz.tsx`(결과 아래 한 줄), `frontend/src/features/student/StudentHome.tsx` 또는 `features/records/MyRecordsPage.tsx`(카드 배치는 구현자 판단), 피드백 표시부(학생 기록 화면에서 `authorSubject` 표시 — `"수학 선생님"`).
- 만들기: `frontend/src/features/records/SubjectReviewCard.tsx`, `frontend/src/styles/screens-subject.css`(`@import`는 `index.css`에. 추가 후 5175 미리보기 재시작 필요).

**인터페이스:** 소비: Task 4 `reviewTopicsBySubject`, `sessionReviewLine`; Task 6 `getReviewInputs`.

- 동의 항목 `SUBJECT_SHARE`: 제목 "교과 선생님에게 공개", 본문 "수학으로 시작한 학습은 수학 선생님도 볼 수 있어요. '나만 보기' 기록은 보이지 않아요.", `LEARNING_RECORD`가 동의가 아니면 선택지 비활성 + "먼저 '선생님에게 학습 기록 공개'에 동의해야 해요". `LEARNING_RECORD`를 거절로 바꾸면 `SUBJECT_SHARE`도 거절로 함께 저장. `FEATURES.subjectTeacher`가 false면 항목 숨김.
- 동의 화면 열람 기록(`ViewLog`): `subject`가 있으면 "오수학 선생님(수학)이 열람"처럼 과목 표시.
- 결과 줄: `sessionReviewLine`이 null이 아니면 "다시 볼 주제: 수학 - 이차함수 그래프".
- 카드 제목 "과목별 다시 볼 주제", 과목 소제목 + `과목 - 주제` 목록, 비었으면 "지금은 다시 볼 주제가 없어요".
- [ ] 순수 함수는 Task 4에서 검증됨. 화면은 mock 5175에서 S1·S4 확인, 375px 가로 넘침 없음.
- [ ] `npx vitest run`, `tsc`, `vite build` 통과. 커밋 `feat: 학생 과목별 다시 볼 주제·교과 공개 동의`

### Task 8: 교과 교사 화면

**파일:**
- 수정: `frontend/src/routes.tsx`, `frontend/src/components/Layout.tsx:20-22`(교사 메뉴), `frontend/src/features/teacher/StudentDetailPage.tsx`(피드백에 과목 표시).
- 만들기: `frontend/src/features/teacher/TeacherHome.tsx`(index: 담임이면 `ClassDashboard`, 아니면 `<Navigate to="/teacher/subjects" replace />`), `features/teacher/SubjectsPage.tsx`(`/teacher/subjects`), `features/teacher/SubjectClassPage.tsx`(`/teacher/subjects/:classId/:subject`), `features/teacher/SubjectStudentPage.tsx`(`/teacher/subjects/:classId/:subject/students/:studentId`). CSS는 `screens-subject.css`.

**인터페이스:** 소비: Task 6 `listMyAssignments`, `getSubjectSummary`, `listSubjectStudents`, `listSessions({studentId, subject})`, `listEntries`, `getReflection`, `listFeedback`, `addFeedback`, `logStudentView(studentId, subject)`.

- 메뉴: 배정이 있고 `FEATURES.subjectTeacher`면 "내 과목"(`/teacher/subjects`). `classId === ""`면 반 대시보드·반 분석·신고된 문제 숨김. 사이드바 프로필의 "2학년 3반" 고정 문구는 담임만.
- SubjectsPage: 배정마다 카드 `"<반 이름> <과목>"` + 이번 주 학습 수·학생 수·후보 많은 주제 3개, `few`면 "이번 주 기록 적음". 카드별 로딩·오류·다시 시도(E10).
- SubjectClassPage: 주제 표(주제, 학습 학생, 다시 볼 후보, 최근 정답률), 많이 틀린 문항 2개(문항 글 + 정답률), 동의 학생 목록 링크. 표에 `<caption>`.
- SubjectStudentPage: 진입 시 `logStudentView(studentId, subject)` 한 번, 그 과목 학습 목록 → 펼치면 공개 기록·돌아보기·피드백 목록·피드백 입력. 상단 안내 "학생이 '교사 공개'로 남긴 수학 학습 기록만 보여요 · 열람 기록이 남아요".
- [ ] mock 5175: S2·S3, E1·E2·E3·E5·E11 확인(오수학, 한담임 각각 로그인). 375px 넘침 없음, 탭 순서.
- [ ] `npx vitest run`, `tsc`, `vite build` 통과. 커밋 `feat: 교과 교사 내 과목·반 집계·학생 열람`

### Task 9: 백엔드 요청서 v0.9

**파일:** 만들기 `docs/backend/2026-11-14-backend-request-v0.9.md`(형식은 v0.8과 같게).

- 내용: `teacher_assignments` DDL(PK, FK, `subject` check — 기타 제외), `current_term()` SQL 함수(Task 1 규칙), `consents.kind`에 `SUBJECT_SHARE` 허용, `subject_share_active(student_id)`, `teaches_subject(student_id, subject)`, 기존 `teaches_student`를 쓰는 sessions·entries·reflections·session_topics·quiz_attempts·feedback 읽기 정책에 `OR teaches_subject(...)` 추가(세션 `goal->>'subject'` 기준), `feedback.author_subject` 서버 채움(트리거), `log_student_view(student_id, subject)` 확장, `subject_week_summary(class_id, subject)` RPC 반환 JSON = Task 5 `SubjectWeekSummary`와 같은 모양, `v_my_assignments`. 거부 테스트 3종(다른 과목·다른 반·미동의)과 기대 결과 0행. 프론트 플래그 켜는 조건.
- [ ] 문서 안의 타입·이름이 Task 3~6과 같은지 대조. 커밋 `docs: 백엔드 요청서 v0.9 교과 교사`

### Task 10: 마무리 검증

- [ ] `npx vitest run`, `npx tsc -b --noEmit`, `npx vite build`, gitleaks(`C:\Users\sy7co\ai-tools\bin\gitleaks.exe git . --no-banner`), `npm audit` 실행·출력 기록.
- [ ] 독립 리뷰(구현과 다른 서브에이전트) → 반영.
- [ ] `docs/PROJECT_LOG.md` 기록, `security-check`.
- [ ] 01-mvp.md 완료 기준 4개를 근거와 함께 보고.
