# 성장 페이스 — API 명세 (프론트 ↔ 백엔드)

> 작성: 프론트 담당 / v0.4 (2026-11-14)
> 프론트는 이 명세대로 mock을 먼저 만들어 개발합니다. 이름·구조를 바꾸고 싶으면 **구현 전에** 말해 주세요.
> 프론트 타입 원본: `frontend/src/types/domain.ts`, 함수 목록: `frontend/src/api/types.ts`
> 규칙 검증 테스트: `frontend/src/api/mockApi.test.ts` — **백엔드도 같은 시나리오로 확인해 주세요.**

---

## v0.6 교과 교사 (추가, 2026-11-14 · 백엔드 미반영 — mock 전용, `FEATURES.subjectTeacher`)

담임 = `role === "teacher" && classId !== ""`. 교과만 맡은 교사는 `classId: ""`. 교과 배정은 `teacher_assignments(teacher_id, class_id, subject, term)`. 현재 학기: 서울 날짜 3~8월 `YYYY-1`, 9~12월 `YYYY-2`, 1~2월 `(YYYY-1)-2`.

**교과 교사 열람 조건 (모두 만족):** 현재 학기 배정(교사, 학생 반, 세션 `goal.subject`) AND 학생 `LEARNING_RECORD` 동의 AND `SUBJECT_SHARE` 동의. 과목 `"기타"`·과목 목록 밖·빈 값은 항상 불가. 기록은 `visibility = TEACHER`만. 담임 조건과 따로 판단한다(담임 겸 교과 교사: 자기 반은 담임 범위, 다른 반은 배정 과목만).

### 새 동의 종류
- `SUBJECT_SHARE` — 교과 선생님 공유. `LEARNING_RECORD`를 끄면 이 값과 관계없이 교과 교사에게 안 보임.

### 함수 (`frontend/src/api/types.ts`)
| 함수 | 호출자 | 규칙 |
|---|---|---|
| `listMyAssignments()` | 교사 | 내 **현재 학기** 배정만 `TeacherAssignment[]`. 학생은 `403 FORBIDDEN` |
| `getReviewInputs(studentId)` | 학생 본인 | 내 세션(과목·시작 시각)·세션 주제·응시·이해도. 교사·다른 학생은 `403 FORBIDDEN` |
| `getSubjectSummary(classId, subject)` | 교과 교사 | **이번 주(서울 월 00:00~일 23:59)** 반·과목 집계 `SubjectWeekSummary`. 동의 학생·그 과목 세션만 집계. 배정 없으면 `404 NOT_FOUND` |
| `listSubjectStudents(classId, subject)` | 교과 교사 | 그 반의 동의(`LEARNING_RECORD`+`SUBJECT_SHARE`) 학생, 번호순. 배정 없으면 `404` |
| `listSessions({ studentId, subject? })` | 변경 | 담임: 자기 반 학생 전체(`subject` 주면 그 과목만). 교과 교사: `subject` 필수(없으면 `404`), 권한 밖(배정·동의·과목 불일치)은 **빈 배열** |
| `logStudentView(studentId, subject?)` | 변경 | 담임: 자기 반. 교과 교사: `subject` 필수, 열람 조건을 만족해야 함(아니면 `404`). audit 행에 `subject` 기록 |
| `getSession`·`listEntries`·`getReflection`·`listFeedback`·`getQuizAttempt`·`summarizeSession` | 변경 | 세션 접근 = 본인 OR 담임 OR 교과 교사 열람 조건. 아니면 `404`. 교과 교사에게 기록은 TEACHER 공개분만. `getSession` audit(`VIEW_SESSION`)에 교과 교사면 과목 기록 |
| `addFeedback(sessionId, content)` | 변경 | 작성자가 그 학생의 담임이 아니면 `authorSubject = session.goal.subject`, 담임이면 `null` |
| `listAiMessages` | 변경 | 교과 교사에게는 빈 배열 (AI 대화는 담임만) |
| `getAssessment` / `requestAiAssessment` / `finalizeAssessment` | 변경 | 담임만. 교과 교사: `getAssessment`는 `null`, 나머지는 `403 FORBIDDEN` |
| `listStudents`·`getDashboard`·`getClassAnalytics`·`listReportedQuestions`·`resolveReport`·`submitManualAuth`·`getTopicGrowth`·`getPaceInputs`·`getRubric` | 변경 없음(담임 전용) | `classId ""`는 어떤 반과도 맞지 않음 → 교과만 맡은 교사는 `404` |

### 필드
- `Feedback.authorSubject?: string | null` — 교과 교사 피드백의 과목. 담임·학생 모두 받음.
- `AuditLog.subject?: string | null` — 교과 교사 열람이면 과목, 담임이면 `null`.

---

## v0.4 단원 테스트 + 교사 종합 보드 (추가)

설계: `docs/01-mvp.md`. 문제는 **AI 초안 → 교사 승인**만 출제. 채점은 서버.

### 엔드포인트

| Method | Path | 권한 | 설명 |
|---|---|---|---|
| GET | `/classes/:classId/units` | 학생·교사(자기 반) | 단원 목록 |
| GET | `/units/:unitId/questions` | 교사(자기 반) | 문제 전체 (정답 포함) — 학생 `403` |
| POST | `/units/:unitId/questions/ai-draft` | 교사 | 성취기준 근거로 DRAFT 3개. `standard` 비면 `400 VALIDATION` |
| POST / PUT | `/questions` · `/questions/:id` | 교사 | 저장. 검증: OX는 `["O","X"]`, MCQ 2~5개, 정답 인덱스 범위, 문제 ≤300자, 해설 ≤500자 |
| PATCH | `/questions/:id/status` | 교사 | `{ status: "DRAFT" \| "APPROVED" }` |
| DELETE | `/questions/:id` | 교사 | 삭제 (audit) |
| GET | `/sessions/:id/quiz` | 학생 본인 | **ENDED + 단원 있음**만, 승인 문제 최대 5개, **정답·해설·근거 제외**. 아니면 `409 QUIZ_NOT_AVAILABLE` |
| POST | `/sessions/:id/quiz` | 학생 본인 | `{ answers: { [questionId]: number \| null } }` → 채점 결과(정답·해설 포함). 세션당 1회, 두 번째 `409 QUIZ_ALREADY_TAKEN` |
| GET | `/sessions/:id/quiz` (결과) | 학생 본인·교사 | 교사는 **기록 공유 동의 없으면 null** |
| GET | `/students/:id/overview` | 교사(자기 반) | 종합 보드 (아래) |

### 규칙
- 학습 시작 `goal.unitId`는 **자기 반 + 같은 과목** 단원만, 아니면 `400 VALIDATION`
- 첫 `GET /sessions/:id/quiz` 때 **출제 스냅샷**(문항 id·문구·섞인 선택지·보정된 정답 번호·해설)을 저장하고, 제출은 **그 스냅샷으로 채점** (그 사이 교사가 문제를 바꾸거나 출제 중지해도 영향 없음). 테이블 `quiz_serves(session_id pk, questions jsonb)`
- 객관식 선택지는 세션마다 결정적으로 섞어 출제 (정답이 늘 1번에 있지 않게), O/X는 `["O","X"]` 고정
- 종합 보드 신호는 **같은 세션의** 응시 결과와 성찰 이해도 짝으로 판단
- 미선택(`null`)·범위 밖 답은 오답
- 종합 보드 신호: 그 단원 최근 세션 이해도 `=== 3` && 최근 정답률 `< 0.6` → `OVERCONFIDENT`, 그 외 `< 0.4` → `LOW_SCORE`
- 기록 공유 동의 없으면 종합 보드는 `sessions`·`minutes`만, 나머지 `null`. 대시보드 `lastQuizRate`도 `null`
- 화면 고정 문구: "테스트는 공부 확인용이에요. 성적에 들어가지 않아요."

```sql
create table units (
  id text primary key, class_id uuid references classes(id),
  subject text not null, "order" int not null, title text not null,
  standard text not null default '', material text
);
create table quiz_questions (
  id uuid primary key default gen_random_uuid(),
  unit_id text not null references units(id) on delete cascade,
  type text not null check (type in ('MCQ','OX')),
  prompt text not null check (char_length(prompt) <= 300),
  choices text[] not null, answer_index int not null,
  explanation text not null default '' check (char_length(explanation) <= 500),
  source text not null check (source in ('AI','TEACHER')),
  status text not null default 'DRAFT' check (status in ('DRAFT','APPROVED')),
  evidence text not null default ''
);
create table quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references sessions(id) on delete cascade,  -- 세션당 1회
  unit_id text not null references units(id),
  student_id uuid not null references users(id),
  correct int not null, total int not null,
  items jsonb not null, created_at timestamptz not null default now()
);
alter table sessions add column goal_unit_id text references units(id);
-- RLS: quiz_questions 는 학생 SELECT 금지 (출제는 서버 함수가 정답 제외해 반환)
```

---

## v0.3 보안 점검 반영 (v0.2보다 우선)

독립 리뷰·보안 점검에서 확인된 문제를 규칙으로 고정했습니다. 서버(RLS·함수)에서 반드시 강제해야 합니다.

| # | 규칙 | 위반 시 |
|---|---|---|
| 1 | **마스킹 강화**: 성을 뺀 이름(2자 이상)·교사 이름, `010.1234.5678`·`+82 10…`·유선(`02-123-4567`), 하이픈 없는 주민번호 13자리, 8자리 이상 숫자열 → 치환. 날짜·수식은 유지. 기준 구현: `frontend/src/lib/privacy.ts` | — |
| 2 | **인증 이벤트**: 세션 시작·종료에 하나를 쓰면 **같은 학생의 남은 미사용 이벤트를 모두 무효화**. 종료 인증은 `verified_at > sessions.started_at`만 허용 | `409 AUTH_EVENT_INVALID` |
| 3 | `GET /classes/:id/students`는 **교사만** | `403 FORBIDDEN` |
| 4 | **기록 공유(LEARNING_RECORD) 동의가 현재 없으면** 교사에게 그 학생의 `entries`·`ai_messages`·`reflections`를 주지 않음 (과거 공개분 포함 = 철회 즉시 숨김). 대시보드 `openQuestionCount`·AI 채점 근거에서도 제외 | 빈 목록 / `null` |
| 5 | **QR**: `POST /auth/qr-token` (학생만) → `{ token, expiresAt }` 랜덤 128bit, **60초, 1회용**. 학생 ID로 유추 불가. **바코드**는 학생증 번호(추측 불가 값), 재사용 가능하지만 `method='BARCODE'`로 기록. 코드 인증은 기기당 **분당 20회** 제한 | 실패 이벤트 / `429` |
| 6 | **동의**: 덮어쓰지 않고 **이력으로 append**, 종류별 마지막 값이 현재. `under14` 학생이 `byGuardian=false`로 `granted=true` 저장 → 거부. 변경은 `audit_logs`(`CONSENT_CHANGE`) | `400 VALIDATION` |

```sql
create table qr_tokens (
  token text primary key,            -- 랜덤 128bit
  student_id uuid not null references users(id),
  expires_at timestamptz not null,
  used_at timestamptz
);
alter table users add column barcode text unique;   -- 학생증 번호 (ID에서 유추 불가)
-- consents: (student_id, kind) unique 제약을 두지 말 것 (이력 보관)
```

---

## v0.2 변경 사항 (본문보다 이 절이 우선)

교육·멘토 내용과 지원 기술 실제 문서를 반영했습니다.

### A. 지원 기술 실제 형태

- **슈퍼스쿨**: 공개 API 없음. 받는 것은 **학교 정보(반, 학생 이름·번호)**뿐. → F1은 시드/엑셀 가져오기로 채우고 `Student` 형태 유지.
- **페이스패스**: 웹훅이 아니라 **토스플레이스 단말기 플러그인 SDK**. 얼굴 인식 후 **시리얼(`merchantUserKey`)만** 넘어옴.
  ```js
  const off = sdk.facePass.listenData((p) => { /* p.merchantUserKey, p.authenticated, p.result, p.message */ off(); });
  const r = await sdk.facePass.start({ showResultScreen: true }); // { type: "SUCCESS" | "FAILED" }
  ```
  `result`: `Authenticated | FaceFailed | Blocked | Denied | Disconnected | Canceled | Timeout`
- 흐름 변경: 키오스크(단말기 플러그인)가 결과를 받아 **우리 서버로 POST** → 서버가 시리얼 → 학생 매핑 → `auth_events` 저장.

```
POST /auth/facepass          헤더: X-Device-Token
요청 { "deviceId": "kiosk-1", "merchantUserKey": "serial", "authenticated": true, "result": "Authenticated", "message": "" }
응답 AuthEvent { id, studentId, maskedName, deviceId, method, success, verifiedAt, consumed }
```

- ⚠️ **보안 주의**: 결과를 단말기(클라이언트)가 보내므로 위조 가능성이 있음. 기기 토큰 + rate limit은 필수. 토스 쪽에 **서버 간 결과 검증 API**가 있는지 2일차에 꼭 질문 (없으면 발표에서 한계로 명시).
- 매핑 테이블 추가:
  ```sql
  create table facepass_links (
    merchant_user_key text primary key,   -- 토스 시리얼. 얼굴 정보 아님
    student_id uuid not null unique references users(id),
    linked_at timestamptz not null default now()
  );
  ```
- 매핑 안 된 시리얼 → `success=false, studentId=null` 로 저장하고 키오스크엔 "등록되지 않은 사용자".

### B. 대체 인증 (쓰기·기기 싫어하는 학생)

- `AuthMethod` = `FACEPASS | QR | BARCODE | MANUAL`
- `POST /auth/code` `{ deviceId, method: "QR" | "BARCODE", token }` — 학생증 바코드 포함. 토큰 1회용·60초 규칙은 QR과 동일 (바코드는 학생증 고정값이면 재사용 가능 → **교사 확인 표시** 필요)
- `POST /auth/manual` `{ studentId }` — **교사만**. 교사가 수기로 확인. `audit_logs` 기록.

### C. 체크리스트 중심 입력 (주관식은 참고용 선택)

- 세션 목표: `goal: string` → **`goal: { subject, activities: string[], note?: string }`**
  - `subject`: 국어/수학/영어/사회/과학/기타, `activities`: `concept | problem | review | summary | reading | assignment`
- 기록 종류에 **`PAPER`** 추가: "종이에 수기로 기록함" 체크만으로 기록 인정, `content`는 빈 문자열 허용.
- 성찰: `changed: string` → **체크리스트**
  ```json
  { "sessionId": "uuid", "checks": ["goal_done", "asked"], "understanding": 2, "remainingQuestions": [], "note": "선택" }
  ```
  - `checks` 항목 ID: `goal_done | new_learned | own_words | asked | ai_checked | next_plan`
  - `understanding`: 1 아직 어려움 / 2 조금 이해 / 3 설명할 수 있음
- 항목 ID 원본: `frontend/src/lib/checklists.ts` (추가만, 변경 금지)

```sql
alter table sessions drop column goal;
alter table sessions add column goal_subject text not null, add column goal_activities text[] not null default '{}', add column goal_note text;
alter table entries drop constraint if exists entries_kind_check;
alter table entries add constraint entries_kind_check check (kind in ('MEMO','QUESTION','QUIZ','PAPER'));
alter table reflections drop column changed;
alter table reflections add column checks text[] not null default '{}', add column understanding int not null check (understanding between 1 and 3), add column note text;
```

### D. 근거 기반 AI (상상해서 쓰지 않음)

- 요약 응답의 모든 문장에 **근거 기록 ID**:
  ```json
  { "activities": [{ "text": "꼭짓점 공식 유도 질문", "evidenceIds": ["entry-uuid"] }],
    "remainingQuestions": [{ "text": "판별식과의 관계", "evidenceIds": ["entry-uuid"] }] }
  ```
- 서버 검증: `evidenceIds`가 해당 세션의 **공개 기록 ID인지 확인**, 아니면 그 문장 버림. 근거 없는 문장은 응답에 넣지 않음.
- 프롬프트에 기록을 `[id] 내용` 형식으로 넣고 "목록에 있는 내용만 사용, 각 문장에 id 표기"를 지시.
- 채점 근거 `evidenceIds`에 쓸 수 있는 값: 공개 `entries.id`, `ai_messages.id`, 그리고 특수값 `"goal"`(세션 목표), `"reflection"`(성찰).
- `ai_messages`의 학생 메시지는 **마스킹된 값으로 저장** (원문 저장 금지, 교사 타임라인에도 마스킹본만 노출).

### E. 교차채점 (AI 제안 → 교사 확정)

| Method | Path | 설명 |
|---|---|---|
| GET | `/classes/:classId/rubric` | 반의 평가 기준 (교사가 설정, 해커톤은 시드) |
| GET | `/sessions/:id/assessment` | 채점 상태 (없으면 404) |
| POST | `/sessions/:id/assessment/ai` | AI 채점안 생성 (**교사만** 호출) |
| PUT | `/sessions/:id/assessment` | 교사 최종 점수 확정 `{ scores: CriterionScore[] }` |

```json
// Rubric
{ "id": "r1", "classId": "uuid", "title": "자기주도학습 관찰 기준",
  "criteria": [{ "id": "planning", "label": "목표 세우기", "levels": ["노력 필요", "보통", "잘함"] }] }

// CriterionScore
{ "criterionId": "planning", "level": 1, "reason": "근거 문장", "evidenceIds": ["entry-uuid"] }
// level은 levels 인덱스. 근거 부족이면 level: null (AI가 추측해서 채우지 않음)

// Assessment
{ "sessionId": "uuid", "rubricId": "r1", "ai": [CriterionScore], "teacher": [CriterionScore] | null, "finalizedAt": null }
```

- AI 점수는 **제안**. 학생에게는 교사 확정본만 보임 (`teacher`가 null이면 학생 응답에서 `ai`도 숨김).
- 교사 점수와 AI 점수가 다른 항목은 프론트에서 "판단 다름"으로 표시 (서버 계산 불필요).
- AI 채점도 `PRIVATE` 기록 제외, 개인정보 마스킹 규칙 동일.
- 대시보드 행에 `pendingAssessment`(교사 미확정 수) 추가.

```sql
create table rubrics (id text primary key, class_id uuid references classes(id), title text not null, criteria jsonb not null);
create table assessments (
  session_id uuid primary key references sessions(id) on delete cascade,
  rubric_id text not null references rubrics(id),
  ai jsonb, teacher jsonb, finalized_at timestamptz
);
```

---

## 0. 공통 규칙

| 항목 | 규칙 |
|---|---|
| 형식 | JSON, 필드명 **camelCase** (DB는 snake_case여도 응답에서 변환) |
| 시간 | ISO 8601 문자열 (`2026-11-13T19:30:00+09:00`) |
| ID | UUID 문자열 |
| 인증 | `Authorization: Bearer <Supabase access token>` |
| 에러 | `{ "error": { "code": "SESSION_ALREADY_ACTIVE", "message": "사람이 읽을 문장" } }` + HTTP 상태 코드 |
| 비밀키 | LLM API 키, 페이스패스 키, Supabase `service_role` 키는 **서버에만** 둔다. 프론트에는 `anon` 키만 (RLS 전제) |
| 권한 판단 | 역할(role)·반(classId)은 **DB `users` 테이블 기준**. JWT `user_metadata`는 사용자가 수정 가능하므로 권한 판단에 쓰지 않음 |
| 에러 노출 | 스택 트레이스·SQL 에러 원문을 응답에 넣지 않음. 권한 없는 리소스는 존재 여부를 숨기도록 `404` |

> **보안·개인정보 규칙은 6장에 모아 두었습니다. 모든 기능 구현 전에 먼저 읽어 주세요.**

구현 방식은 자유입니다. 단순 CRUD는 Supabase 테이블 + RLS로 프론트가 직접 조회해도 되고, 로직이 있는 것(AI, 세션 종료, 웹훅, 대시보드 집계)은 Edge Function / Pages Function으로 만들어 주세요. **어느 쪽으로 할지 표의 "구현 제안" 열에 표시해 두었으니 확인 부탁합니다.**

---

## 1. 기능 요약

| # | 기능 | 사용자 | 우선순위 |
|---|---|---|---|
| F1 | 학생·반 정보 조회 (슈퍼스쿨 연동 자리) | 학생, 교사 | P0 |
| F2 | 페이스패스 인증 결과 수신 + QR 대체 | 키오스크 | P0 |
| F3 | 학습 세션 시작·종료 (인증 시각 기록) | 학생 | P0 |
| F4 | 학습 기록 (메모, 질문, 짧은 테스트) | 학생 | P0 |
| F5 | AI 논의 (질문을 돌려주는 학습 도우미) | 학생 | P0 |
| F6 | 세션 요약 (주요 활동, 남은 질문) | 학생 | P1 |
| F7 | 성찰 저장 | 학생 | P0 |
| F8 | 교사 피드백 | 교사 | P0 |
| F9 | 교사 반 대시보드 집계 | 교사 | P1 |
| F10 | 리포트 (현장 양식 맞춤) | 교사 | P2 (양식 확보 후) |

P0 = 1일차 필수 / P1 = 데모 전까지 / P2 = 여유 있으면

---

## 2. 엔드포인트

### F1. 학생·반 정보

| Method | Path | 설명 | 구현 제안 |
|---|---|---|---|
| GET | `/me` | 로그인 사용자 정보 | 테이블 직접 |
| GET | `/classes/:classId/students` | 반 학생 목록 | 테이블 직접 |

```json
// GET /me → 200
{ "id": "uuid", "name": "김교사", "role": "teacher", "classId": "uuid" }
// role: "student" | "teacher"

// GET /classes/:classId/students → 200
[ { "id": "uuid", "name": "학생01", "classId": "uuid", "number": 1 } ]
```

> 임시: 지금은 시드 데이터. 2일차에 슈퍼스쿨 API로 동기화할 수 있으면 교체.

---

### F2. 페이스패스 인증

흐름: 키오스크 화면이 대기 → 학생이 얼굴 인증 → (토스 → 우리 서버 웹훅) → `auth_events` 저장 → 서버가 `kiosk:<deviceId>` 채널로 마스킹된 결과 Broadcast → 키오스크가 받음

| Method | Path | 설명 | 구현 제안 |
|---|---|---|---|
| POST | `/facepass/webhook` | 토스 → 우리 서버. 인증 결과 수신 | Function (임시) |
| POST | `/auth-events/qr` | QR 대체 인증 | Function |
| POST | `/dev/facepass/simulate` | **개발·데모용** 가짜 인증 발생 | Function |
| — | Realtime Broadcast: `kiosk:<deviceId>` 채널 | 키오스크가 구독 (테이블 직접 구독 X) | Broadcast |

```json
// auth_events 한 건 (프론트가 받는 형태)
{
  "id": "uuid",
  "studentId": "uuid",
  "deviceId": "kiosk-study-room-1",
  "method": "FACEPASS",          // "FACEPASS" | "QR" | "MANUAL"
  "success": true,
  "verifiedAt": "2026-11-13T19:30:00+09:00"
}

// POST /auth-events/qr  요청
{ "deviceId": "kiosk-study-room-1", "qrToken": "string" }

// POST /dev/facepass/simulate  요청
{ "deviceId": "kiosk-study-room-1", "studentId": "uuid", "success": true }
```

- 얼굴 이미지·특징값은 **받지도 저장하지도 않음**. 인증 결과만 저장.
- 웹훅 요청 형식은 2일차에 확정. 지금은 `simulate`로 같은 `auth_events`를 만들어 주면 프론트는 그대로 동작합니다.
- 웹훅: 서명 검증 + 재전송 방지 + 멱등 처리 필수 (6.3).
- `simulate`: `ALLOW_DEV_SIMULATE=true`인 환경에서만 동작, 교사 계정만 호출 가능. 운영 환경에서는 `404`.
- QR 토큰: 서버 서명, **1회용, 유효 60초**. 캡처 공유로 대리 인증하는 것 방지 (6.3).
- 키오스크 요청은 기기 토큰(`X-Device-Token`)으로 인증. 기기별 발급·폐기 가능.
- 키오스크 화면에 내려주는 이름은 **마스킹**(`김*수`). 응답에 다른 개인정보 넣지 않음.

---

### F3. 학습 세션

| Method | Path | 설명 | 구현 제안 |
|---|---|---|---|
| POST | `/sessions` | 세션 시작 | Function |
| POST | `/sessions/:id/end` | 세션 종료 | Function |
| GET | `/sessions/:id` | 세션 상세 | 테이블 직접 |
| GET | `/sessions?studentId=&classId=&from=&to=` | 세션 목록 (최신순) | 테이블 직접 |

```json
// POST /sessions  요청
{ "studentId": "uuid", "goal": "이차함수 꼭짓점 구하는 법 이해하기", "authEventId": "uuid" }

// → 201 LearningSession
{
  "id": "uuid",
  "studentId": "uuid",
  "goal": "이차함수 꼭짓점 구하는 법 이해하기",
  "startedAt": "2026-11-13T19:30:00+09:00",
  "endedAt": null,
  "startAuth": "FACEPASS",
  "endAuth": null,
  "status": "ACTIVE",
  "durationMinutes": null
}

// POST /sessions/:id/end  요청
{ "authEventId": "uuid" }
// → 200 LearningSession (status "ENDED", endedAt, endAuth, durationMinutes 채워짐)
```

규칙
- `startedAt` / `endedAt`은 **인증 이벤트의 `verifiedAt`**을 사용 (클라이언트 시각 X).
- 학생당 ACTIVE 세션은 1개. 이미 있으면 `409 SESSION_ALREADY_ACTIVE`.
- 이미 종료된 세션 종료 시 `409 SESSION_ALREADY_ENDED`.
- 인증 이벤트의 `studentId`가 세션 학생과 다르면 `403 AUTH_STUDENT_MISMATCH`.
- 인증 이벤트 검증: `success = true`, **발생 후 2분 이내**, **아직 사용 안 됨**(`consumed_at is null`). 쓰면 즉시 `consumed_at` 기록. 위반 시 `409 AUTH_EVENT_INVALID`.
- 요청 body의 `studentId`는 로그인 사용자 본인과 일치해야 함 (다른 학생 이름으로 세션 생성 차단).
- 학생이 **페이스패스·AI 이용 동의**를 하지 않았으면 `403 CONSENT_REQUIRED` (6.1). 동의 없이도 QR + 기록 기능은 쓸 수 있어야 함 (형평성).

---

### F4. 학습 기록

| Method | Path | 설명 | 구현 제안 |
|---|---|---|---|
| POST | `/sessions/:id/entries` | 기록 추가 | 테이블 직접 |
| GET | `/sessions/:id/entries` | 기록 목록 (시간순) | 테이블 직접 |

```json
// POST 요청
{ "kind": "QUESTION", "content": "꼭짓점 공식은 왜 -b/2a 인가?", "visibility": "TEACHER" }
// kind: "MEMO" | "QUESTION" | "QUIZ"
// visibility: "TEACHER"(교사에게 공개, 기본) | "PRIVATE"(나만 보기)

// → 201 LearningEntry
{ "id": "uuid", "sessionId": "uuid", "kind": "QUESTION", "content": "...", "visibility": "TEACHER", "createdAt": "..." }
```

- ACTIVE 세션에만 추가 가능. 아니면 `409 SESSION_NOT_ACTIVE`.
- `PRIVATE` 기록은 **교사 조회·대시보드 집계·AI 요약에서 제외** (RLS로 강제). 학생이 무엇을 공유할지 스스로 정함.
- `content` 최대 2,000자.
- `QUIZ`는 1일차엔 `content`에 문제·학생 답을 텍스트로 저장 (구조화는 여유 있을 때).

---

### F5. AI 논의

| Method | Path | 설명 | 구현 제안 |
|---|---|---|---|
| POST | `/sessions/:id/ai/messages` | 학생 메시지 전송 → AI 답변 | **Function 필수** |
| GET | `/sessions/:id/ai/messages` | 대화 기록 | 테이블 직접 |

```json
// POST 요청
{ "content": "꼭짓점 공식 그냥 알려줘" }

// → 200 (학생 메시지와 AI 답변 둘 다 저장 후 AI 답변 반환)
{ "id": "uuid", "sessionId": "uuid", "role": "ai", "content": "...", "createdAt": "..." }
```

AI 함수 요구사항
- 모델 컨텍스트: 세션 `goal` + 최근 기록(entries) + 최근 대화 10개.
- **정답을 바로 주지 않는다.** 학생이 다음 단계를 스스로 생각하게 하는 질문·힌트·반례 위주. "다 알려줘" 요청에도 단계적 힌트로 응답.
- 학생 이름 등 개인정보는 모델에 보내지 않음 (studentId도 X). 학생 입력은 **전송 전 마스킹**(전화번호, 이메일, 주민번호 패턴, 반 학생 이름 목록) (6.4).
- 컨텍스트는 **서버가 sessionId로 직접 조회**하고, 요청자가 그 세션의 학생 본인인지 먼저 확인. 클라이언트가 보낸 컨텍스트를 그대로 쓰지 않음.
- 프롬프트 인젝션 대비: 학생 입력은 시스템 지시와 분리된 user 메시지로만 넣고, 시스템 프롬프트·다른 학생 데이터는 컨텍스트에 넣지 않음.
- 호출 제한: 학생당 **분당 10회, 하루 200회** → 초과 시 `429 RATE_LIMITED`.
- 입력 최대 1,000자.
- 타임아웃 20초 → `504 AI_TIMEOUT`. 프론트는 재시도 버튼 표시.
- 스트리밍(SSE)은 가능하면 P1로. 1일차는 일반 응답으로 OK.

---

### F6. 세션 요약

| Method | Path | 설명 | 구현 제안 |
|---|---|---|---|
| POST | `/sessions/:id/summary` | 종료된 세션 요약 생성 (AI) | Function |

```json
// → 200
{
  "activities": ["꼭짓점 공식 유도 과정 질문", "예제 2개 풀이 메모"],
  "remainingQuestions": ["판별식과 꼭짓점의 관계?"]
}
```

- 학생의 기록 문장을 근거로만 요약 (없는 내용 생성 금지). `PRIVATE` 기록은 제외.
- 결과는 `sessions.summary`(jsonb)에 캐시 → 다시 부르면 저장된 값 반환.

---

### F7. 성찰

| Method | Path | 설명 | 구현 제안 |
|---|---|---|---|
| PUT | `/sessions/:id/reflection` | 성찰 저장 (덮어쓰기) | 테이블 직접 |
| GET | `/sessions/:id/reflection` | 성찰 조회 (없으면 404) | 테이블 직접 |

```json
// PUT 요청 / GET 응답
{
  "sessionId": "uuid",
  "changed": "공식을 외우기만 했는데 완전제곱식에서 나오는 걸 알게 됨",
  "remainingQuestions": ["판별식과 꼭짓점의 관계?"],
  "updatedAt": "..."
}
```

---

### F8. 교사 피드백

| Method | Path | 설명 | 구현 제안 |
|---|---|---|---|
| POST | `/sessions/:id/feedback` | 피드백 작성 (교사만) | 테이블 직접 + RLS |
| GET | `/sessions/:id/feedback` | 피드백 목록 | 테이블 직접 |

```json
// POST 요청
{ "content": "남은 질문 좋아요. 판별식은 다음 시간에 같이 봐요." }
// → 201
{ "id": "uuid", "sessionId": "uuid", "teacherId": "uuid", "content": "...", "createdAt": "..." }
```

---

### F9. 교사 반 대시보드

| Method | Path | 설명 | 구현 제안 |
|---|---|---|---|
| GET | `/classes/:classId/dashboard?from=&to=` | 학생별 주간 집계 | Function 또는 DB view |

```json
// → 200
{
  "classId": "uuid",
  "from": "2026-11-09",
  "to": "2026-11-15",
  "students": [
    {
      "studentId": "uuid",
      "name": "학생01",
      "sessionCount": 4,
      "totalMinutes": 210,
      "openQuestionCount": 3,
      "lastSessionAt": "2026-11-13T21:00:00+09:00",
      "hasUnreadReflection": true,
      "needsAttention": true
    }
  ]
}
```

- `openQuestionCount` = 해당 기간 성찰의 `remainingQuestions` 수 합계.
- `needsAttention` = `openQuestionCount >= 3` 또는 최근 7일 세션 0회 (규칙은 같이 조정). **점수나 순위가 아닌 신호**로만 사용.
- 교사 본인 반만 조회 가능. 다른 반 `classId`면 `404`.
- 교사가 학생 상세 기록을 열람할 때마다 `audit_logs`에 기록 (6.5).

---

## 3. DB 스키마 (제안)

```sql
create table classes (
  id uuid primary key default gen_random_uuid(),
  name text not null
);

create table users (
  id uuid primary key,                       -- auth.users.id
  name text not null,
  role text not null check (role in ('student','teacher')),
  class_id uuid references classes(id),
  number int
);

create table devices (
  id text primary key,                       -- 'kiosk-study-room-1'
  class_id uuid references classes(id),
  token_hash text not null,                  -- 기기 토큰은 해시만 저장
  revoked_at timestamptz
);

create table consents (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references users(id),
  kind text not null check (kind in ('FACEPASS','AI','LEARNING_RECORD')),
  granted boolean not null,
  by_guardian boolean not null default false, -- 만 14세 미만은 보호자 동의
  policy_version text not null,               -- 동의한 안내문 버전
  created_at timestamptz not null default now()
);

create table auth_events (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references users(id),
  device_id text not null references devices(id),
  method text not null check (method in ('FACEPASS','QR','MANUAL')),
  success boolean not null,
  verified_at timestamptz not null default now(),
  consumed_at timestamptz,                    -- 세션 시작/종료에 사용된 시각 (재사용 방지)
  provider_event_id text unique               -- 웹훅 멱등 처리용
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references users(id),
  goal text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  start_auth text not null,
  end_auth text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','ENDED')),
  summary jsonb
);
create unique index one_active_session_per_student
  on sessions(student_id) where status = 'ACTIVE';

create table entries (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  kind text not null check (kind in ('MEMO','QUESTION','QUIZ')),
  content text not null check (char_length(content) <= 2000),
  visibility text not null default 'TEACHER' check (visibility in ('TEACHER','PRIVATE')),
  created_at timestamptz not null default now()
);

create table ai_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  role text not null check (role in ('student','ai')),
  content text not null,
  created_at timestamptz not null default now()
);

create table reflections (
  session_id uuid primary key references sessions(id) on delete cascade,
  changed text not null,
  remaining_questions text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table feedback (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  teacher_id uuid not null references users(id),
  content text not null,
  created_at timestamptz not null default now()
);

create table audit_logs (
  id bigserial primary key,
  actor_id uuid not null references users(id),
  action text not null,                       -- 'VIEW_STUDENT_DETAIL', 'EXPORT_REPORT', 'DELETE_DATA' ...
  target_student_id uuid references users(id),
  created_at timestamptz not null default now()
);
```

### 권한 (RLS)

**모든 테이블 RLS 활성화, 기본 거부.** 정책은 필요한 것만 추가.

| 테이블 | 학생 | 교사 | 서버 함수(service_role) |
|---|---|---|---|
| users | 본인 읽기 | 자기 반 학생 읽기 | 전체 |
| sessions | 본인 읽기 (쓰기는 함수 경유) | 자기 반 읽기 | 전체 |
| entries | 본인 읽기·쓰기 | 자기 반 + `visibility='TEACHER'`만 읽기 | 전체 |
| ai_messages | 본인 읽기 | 자기 반 읽기 | 쓰기 |
| reflections | 본인 읽기·쓰기 | 자기 반 읽기 | 전체 |
| feedback | 자기 세션 것 읽기 | 자기 반 읽기·쓰기 | 전체 |
| consents | 본인 읽기 | 자기 반 읽기 (동의 여부만) | 쓰기 |
| auth_events | 없음 | 없음 | 전체 (키오스크는 Broadcast로만 받음) |
| devices, audit_logs | 없음 | 없음 | 전체 |

- 키오스크 Realtime: `auth_events` 테이블을 직접 구독시키지 말고, 서버 함수가 해당 `deviceId` 채널로 **마스킹된 결과만 Broadcast** (다른 기기·학생 이벤트 노출 방지).
- RLS 정책은 **학생 A 계정으로 학생 B 데이터 조회 시 0건**, **교사 A로 다른 반 조회 시 0건** 두 가지를 반드시 직접 확인.

### Realtime 켜 줄 테이블

- Broadcast 채널 `kiosk:<deviceId>` (키오스크 인증 대기, 테이블 구독 아님)
  - **private 채널**(Realtime Authorization)로 만들고 기기 토큰을 가진 키오스크만 구독 허용. 공개 채널이면 anon 키만으로 누구나 엿들을 수 있음.
- `sessions` postgres_changes (교사 대시보드 "지금 학습 중", P1, RLS 적용 상태로)

---

## 4. 시드 데이터 요청

- 반 1개, 교사 1명, 학생 30명 (이름은 가명: 학생01~30)
- 최근 2주 세션 학생당 0~6개, 세션마다 기록 3~8개, 성찰 대부분 작성
- 데모용 계정: 교사 1, 학생 1 (비밀번호는 팀 채널로만 공유)

---

## 5. 2일차에 확정할 것

- [ ] 페이스패스 결과 전달 방식 (웹훅 / 폴링 / SDK) → `/facepass/webhook` 형식 교체
- [ ] 토스 사용자 ↔ 학생 ID 매핑 방법
- [ ] 슈퍼스쿨에서 받을 수 있는 데이터 범위 (학생 명단, 반, 시간표 등)
- [ ] 멘토에게 받은 현장 양식 → F10 리포트 형식

## 6. 보안·개인정보 처리 (필수)

> 이 서비스는 **미성년자 학습 기록 + 생체 인증 결과 + 외부 AI 전송**을 다룹니다. 아래는 해커톤 기준 최소선입니다.
> 법 조항은 공개 자료 기준 정리이며 법률 검토를 받은 것은 아닙니다.

### 6.1 수집·동의 (개인정보 보호법 기준)

| 항목 | 처리 |
|---|---|
| 얼굴 정보 | **수집하지 않음.** 토스가 보관하고 우리는 인증 결과(누가·언제·어느 기기)만 받음. 생체정보는 민감정보(제23조)라 직접 다루지 않는 구조 자체가 보호 장치 |
| 만 14세 미만 | 법정대리인(보호자) 동의 필요 (제22조의2). `consents.by_guardian` 기록 |
| 동의 분리 | 페이스패스 / AI 이용 / 학습 기록 공유를 **각각** 동의. 하나를 거부해도 나머지 이용 가능 |
| 대체 수단 | 페이스패스 거부 → QR. AI 거부 → AI 패널 숨김, 기록 기능은 그대로 (형평성) |
| 국외 이전 | LLM API 서버가 해외면 국외 이전 고지·동의 대상 (제28조의8). 마스킹 후 최소 텍스트만 전송하고 동의 안내문에 명시 |
| 수집 최소화 | 학생: 이름, 반, 번호만. 연락처·주소·성적 수집 안 함 |
| 목적 외 이용 금지 | 학습 기록을 **평가·징계·순위에 쓰지 않음**을 안내문과 화면에 명시. 학습 시간은 성실도 점수로 쓰지 않음 |

### 6.2 인증·권한

- Supabase Auth 사용. 권한은 `users.role`, `users.class_id` 기준 (JWT `user_metadata` 신뢰 금지).
- 모든 테이블 RLS 기본 거부 (3장 권한 표).
- 서버 함수는 `service_role`을 쓰므로 **함수 안에서 요청자 권한을 직접 검사** (RLS가 우회되기 때문).
- 키오스크: 학생 로그인 없음. 기기 토큰으로만 동작, 화면은 인증 결과 표시 후 5초 내 초기화.

### 6.3 페이스패스·QR 연동

- 웹훅: 토스가 제공하는 **서명(HMAC 등) 검증**, 타임스탬프 5분 초과 요청 거부, `provider_event_id`로 중복 처리 방지. 검증 실패는 `401`, 로그에 원문 저장 안 함.
- 인증 이벤트는 2분 내 1회만 사용 가능 (`consumed_at`) → 재사용·대리 시작 방지.
- QR: 서버 서명된 1회용 토큰, 60초 만료. `method = 'QR'`로 기록해 교사가 구분 가능.
- `simulate` 엔드포인트는 운영 배포에서 꺼짐 (`ALLOW_DEV_SIMULATE`).

### 6.4 AI 전송

- 보내는 것: 세션 목표, 공개 기록(PRIVATE 제외), 최근 대화. **이름·ID·반·학교명 제외.**
- 서버에서 마스킹: 전화번호, 이메일, 주민번호 패턴, 반 학생 이름 목록 → `[이름]`, `[연락처]`로 치환.
- LLM 제공사의 API 데이터 보관·학습 미사용 정책 확인 후 발표 자료에 명시.
- AI 응답은 프론트에서 **텍스트로만 렌더링** (HTML 실행 금지).
- 프롬프트·응답 원문을 서버 로그(console)에 남기지 않음.

### 6.5 접근 기록·투명성

- 교사의 학생 상세 열람, 리포트 출력, 데이터 삭제는 `audit_logs`에 기록.
- 학생은 **교사가 볼 수 있는 내용을 그대로 미리보기** 가능 (무엇이 공유되는지 숨기지 않음).
- 학생 기록 화면에 "교사 공개 / 나만 보기" 표시.

### 6.6 보관·파기·권리 보장

| 데이터 | 보관 기간 (제안) |
|---|---|
| auth_events | 90일 후 자동 삭제 (출결 근거는 세션 시각에 남음) |
| ai_messages | 학기 종료 시 삭제 |
| sessions, entries, reflections, feedback | 학년도 종료 시 삭제 또는 학생 요청 시 즉시 |
| audit_logs | 1년 |

- 학생(또는 보호자) 요청 시 **열람·정정·삭제** 가능해야 함 → `DELETE /me/data` (P2, 해커톤에선 화면 + 설계만).
- 계정 삭제 시 `on delete cascade`로 연결 데이터 함께 삭제.

### 6.7 인프라·운영

- Supabase 리전: **서울(ap-northeast-2)** 선택 (국내 저장).
- `.env`는 Git에 올리지 않음 (`.gitignore` 확인). 키가 커밋되면 즉시 재발급.
- Cloudflare Pages `_headers`로 보안 헤더 설정: `Content-Security-Policy`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy`.
- 입력 길이 제한, AI 호출 rate limit, 에러 메시지에 내부 정보 노출 금지.
- 해커톤 데모에는 **실제 학생 데이터를 쓰지 않음**. 시드는 전부 가명.

### 6.8 백엔드 완료 전 확인 목록

- [ ] 학생 A 토큰으로 학생 B 세션·기록 조회 → 0건 / `404`
- [ ] 교사 A 토큰으로 다른 반 대시보드 → `404`
- [ ] 교사 토큰으로 `PRIVATE` 기록 조회 → 0건
- [ ] 같은 `authEventId`로 세션 두 번 시작 → `409`
- [ ] 서명 없는 웹훅 → `401`
- [ ] 프론트 번들에서 `service_role`, LLM 키 문자열 검색 → 없음
- [ ] AI 함수에 보낸 실제 payload 로그(개발 중 1회 확인)에 이름·전화번호 없음

---

## 7. 프론트 진행 상황

프론트는 이 명세 그대로 mock으로 먼저 만듭니다. 백엔드 쪽 기능이 하나 끝날 때마다 알려 주면 그 함수만 실제 API로 바꿉니다.
