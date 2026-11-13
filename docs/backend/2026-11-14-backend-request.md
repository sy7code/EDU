# 백엔드 요청 (프론트 → 백엔드) — 2026-11-14

> 기준: 백엔드 `FRONTEND_NOTES.md`(2026-11-13), `schema.sql`. 프론트 브랜치 `feat/supabase-connect`에서 실제 백엔드로 학생·교사 핵심 흐름 확인 완료.
> 아래 SQL은 **초안**입니다. 실제 DB에서 실행해 보지 않았으니 검토 후 적용해 주세요.

---

## 0. 연결 결과 (참고)

실제 백엔드로 확인한 흐름: 로그인 → 데모 인증 → `/sessions` → 기록 insert → AI(약 5.2초, "정답 알려줘"에 힌트로 응답) → 종료 → 요약 → 성찰 upsert → 교사 대시보드 RPC(30명) → 학생 상세 → 피드백 insert. **모두 정상.**

확인 중 생긴 데이터(지워도 됨): 학생01 세션 1개(목표에 "연결 테스트"), 기록 3, AI 대화 1, 성찰 1, 교사 피드백 1("[연결 테스트]").

---

## 1. 기존 기능 요청 (우선순위 순)

### 1-1. [높음·개인정보] 동의가 없어 공유 미동의 학생 기록도 교사에게 보임
- 지금: `entries_read`(TEACHER 공개분), `reflections_read`, `ai_messages_read`가 교사에게 항상 열림. 프론트는 실제 모드에서 동의 화면을 숨기고 "전부 동의"로 간주 중.
- 최소 요청: `consents` 테이블 + 교사 조회 정책에 "현재 기록 공유 동의" 조건. 이번 해커톤에서 못 하면 **발표 자료에 한계로 명시**가 필요합니다.
- 별도 확인: `ai_messages`에 학생 원문이 저장되는지, 마스킹본이 저장되는지. 프론트 mock은 **마스킹본을 저장**(교사 화면에 전화번호 등이 안 보이게).

### 1-2. [중간] 성찰을 체크리스트로 저장
- 프론트는 체크리스트(체크 항목·이해도 1~3·참고 메모). 지금은 `changed` 텍스트에 아래 형식으로 넣고 다시 파싱 중(임시):
  ```
  이해도: 2/3
  ✓ 모르는 것을 질문했다
  메모: ...
  ```
- 요청: 컬럼 추가 후 `v_reflections`에 노출 → 프론트가 컬럼을 직접 읽도록 바꿉니다(텍스트 형식은 예전 데이터 호환용으로 유지).

### 1-3. [낮음] 종이 기록(PAPER)
- 쓰기 부담이 큰 학생용 "종이에 기록했어요" 버튼. 지금은 `MEMO` + "📝 종이에 기록함"으로 저장 중. 요청: `kind`에 `PAPER` 허용, PAPER는 빈 내용 허용.

### 1-4. [참고] `/auth-events/latest`
- 인증 대기 화면이 1.5초마다 호출, 인증 없으면 404 → 프론트는 "아직 없음"으로 처리. 콘솔에 404가 계속 쌓이므로 가능하면 **200 + `null`** 응답이 더 깔끔합니다(필수 아님).

### 1-1~1-3 SQL 초안
```sql
-- 1-2. 성찰 체크리스트
alter table reflections
  add column checks text[] not null default '{}',
  add column understanding int check (understanding between 1 and 3),
  add column note text check (char_length(note) <= 500);
alter table reflections alter column changed set default '';

create or replace view v_reflections with (security_invoker = true) as
  select session_id as "sessionId", changed, checks, understanding, note,
         remaining_questions as "remainingQuestions", updated_at as "updatedAt"
  from reflections;

-- 1-3. PAPER (제약 이름은 \d entries 로 확인 후 맞춰 주세요)
alter table entries drop constraint if exists entries_kind_check;
alter table entries add constraint entries_kind_check check (kind in ('MEMO','QUESTION','QUIZ','PAPER'));
alter table entries drop constraint if exists entries_content_check;
alter table entries add constraint entries_content_check
  check (char_length(content) <= 2000 and (kind = 'PAPER' or char_length(content) >= 1));

-- 1-1. 동의 (최소안)
create table consents (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references users(id) on delete cascade,
  kind text not null check (kind in ('FACEPASS','AI','LEARNING_RECORD')),
  granted boolean not null,
  by_guardian boolean not null default false,
  policy_version text not null,
  created_at timestamptz not null default now()
);  -- (student_id, kind) unique 두지 말 것: 이력 보관, 종류별 최신 행이 현재 값
alter table consents enable row level security;
create policy consents_read on consents for select using (student_id = auth.uid() or teaches_student(student_id));
create policy consents_insert on consents for insert with check (student_id = auth.uid());

create function shares_record(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select granted from consents
                   where student_id = uid and kind = 'LEARNING_RECORD'
                   order by created_at desc limit 1), true)  -- 동의 기록 없으면 기존처럼 허용(시드 호환). 운영은 false 권장
$$;
create function teaches_shared_session(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from sessions where id = sid and teaches_student(student_id) and shares_record(student_id))
$$;
-- 교사 조회 정책 교체
drop policy entries_read on entries;
create policy entries_read on entries for select
  using (owns_session(session_id) or (visibility = 'TEACHER' and teaches_shared_session(session_id)));
drop policy reflections_read on reflections;
create policy reflections_read on reflections for select
  using (owns_session(session_id) or teaches_shared_session(session_id));
drop policy ai_messages_read on ai_messages;
create policy ai_messages_read on ai_messages for select
  using (owns_session(session_id) or teaches_shared_session(session_id));
grant select on consents to authenticated;  -- 또는 v_consents view
grant insert on consents to authenticated;
```

---

## 2. 새 기능: 주제별 성장 + 객관적 테스트 (명세 v0.5)

설계: `docs/01-mvp.md` "주제별 성장 + 객관적 테스트". 요약:
- 과목·단원을 고르지 않는다(고교학점제). 학생은 공부하고 기록만.
- 학습을 마치면 **AI가 기록에서 주제 1~3개를 추출**(근거 기록 ID 필수). 반 단위 **주제 사전**으로 같은 개념은 같은 주제로 묶는다.
- 학생이 고른 주제로 **고정 난이도 5문항**(개념 확인 3 + 적용 2, 객관식·O/X). **학생 수준에 맞추지 않음** → 객관적 측정. 같은 반·같은 주제는 **문항 풀 재사용**.
- AI 도우미 대화는 학생 수준에 맞춤.
- 이상한 문제는 응시 중 **신고** → 그 문항은 채점에서 일단 제외, 교사가 "제외 유지 / 기각" 결정(기각하면 재채점).
- 화면 문구: "테스트는 공부 확인용이에요. 성적에 들어가지 않아요."

### 2-1. 함수 엔드포인트 (전부 `/functions/v1/api`, 에러 형식 기존과 동일)

| Method | Path | 권한 | 요청 | 성공 응답 |
|---|---|---|---|---|
| POST | `/sessions/:id/topics` | 학생 본인, **ENDED** | 없음 | `{ topics: [{ topicId, name, subject, evidenceIds }] }` (1~3개, 두 번째부터 캐시) |
| POST | `/sessions/:id/quiz` | 학생 본인, ENDED | `{ topicId }` | `{ topic: { id, name }, questions: [{ id, type, prompt, choices }] }` — **정답·해설 제외** |
| POST | `/sessions/:id/quiz/report` | 학생 본인, 제출 전 | `{ questionId, reason }` reason: `WRONG_ANSWER \| UNCLEAR \| UNRELATED` | `{ ok: true }` |
| POST | `/sessions/:id/quiz/submit` | 학생 본인 | `{ answers: { [questionId]: number \| null } }` | `QuizAttempt` (아래) |
| POST | `/quiz/reports/:id/resolve` | 교사(자기 반) | `{ action: "KEEP_EXCLUDED" \| "DISMISS" }` | `{ ok: true }` |
| RPC | `student_topic_growth(p_student_id uuid)` | 학생 본인·교사(자기 반) | | `{ shared, topics: [TopicGrowth] }` |
| RPC | `class_reported_questions(p_class_id uuid)` | 교사 | | `[ReportedQuestion]` |

```ts
type QuizAttempt = { id; sessionId; topicId; studentId; correct: number; total: number /* 신고 제외 */; createdAt;
  items: [{ questionId, prompt, choices, chosen: number|null, answerIndex, correct, explanation, reported: boolean }] };
type TopicGrowth = { topicId; name; subject?; sessions; minutes; attempts; firstRate: number|null; lastRate: number|null;
  lastUnderstanding: 1|2|3|null; signal: "OVERCONFIDENT"|"LOW_SCORE"|null };
type ReportedQuestion = { reportId; topicName; prompt; choices; answerIndex; explanation; reason; studentNumber; createdAt; status };
```

**에러 코드 추가**: `QUIZ_NOT_AVAILABLE`(409: 진행 중 세션, 이번 세션 주제가 아님), `QUIZ_ALREADY_TAKEN`(409: 세션당 1회).

### 2-2. 함수 동작 규칙 (프론트 mock이 테스트로 고정한 것과 동일하게)

**주제 추출 `/topics`**
1. LLM 입력: 반의 기존 주제 이름 목록 + 이 세션의 **교사 공개 기록**(마스킹) + 목표 텍스트. PRIVATE 기록은 넣지 않음.
2. LLM 출력(JSON): `[{ name, existingTopicId?, subject, evidenceIds }]`. 지시: "기존 주제와 같은 개념이면 existingTopicId를 쓰고, 없을 때만 개념 단위 짧은 이름으로 새로 만든다. 기록에 근거가 없으면 만들지 않는다."
3. 서버 검증: `evidenceIds` ⊂ 이 세션 TEACHER 기록 ID ∪ `{"goal"}` 아닌 것은 버림 → **근거 0개 주제는 버림**. 새 이름은 `topics(class_id, name)` unique로 중복 방지.
4. `session_topics`에 저장(캐시).

**출제 `/quiz`**
1. `topicId`가 이 세션의 `session_topics`에 있어야 함. 아니면 `QUIZ_NOT_AVAILABLE`.
2. 이미 `quiz_serves`가 있으면 그대로 반환(새로고침 안전).
3. 풀(`topic_questions`, `excluded = false`)에 개념 3·적용 2가 모자라면 **LLM으로 부족한 만큼만 생성** → 검증(OX 선택지 `["O","X"]`, 객관식 2~5개, 정답 인덱스 범위, 문제 ≤300자, 해설 ≤500자) → 풀에 저장. 고정 난이도 지시: "주제의 핵심 개념을 이해했는지 확인하는 교과서 기본 수준. 학생 기록을 베끼지 말고 개념 설명을 근거로."
4. 세션 ID 기반 결정적 선택(개념 3 + 적용 2), **객관식 선택지는 세션마다 섞고 정답 인덱스 보정**, `quiz_serves`에 스냅샷 저장.

**신고·채점**
- 신고는 제출 전, 스냅샷의 문항에만. 신고한 문항은 채점에서 빠짐(`total`에서 제외). 전부 신고하면 `total = 0` → 정답률 계산 안 함(`null`).
- 제출은 **스냅샷으로** 채점(그 사이 풀이 바뀌어도 영향 없음), 세션당 1회.
- 교사 `DISMISS` → 해당 응시 재채점(문항 포함), `KEEP_EXCLUDED` → 문항 `excluded = true`(풀에서 빠짐, 이후 출제 안 됨).
- 신고 남발 위험: 학생별 신고 수를 `class_reported_questions`에 보이게 해 교사가 판단.

**AI 도우미 수준 맞춤 (`/ai/messages` 수정)**
- 시스템 프롬프트에 이 학생의 최근 주제 정답률·이해도를 넣고 "설명 깊이를 맞추되 정답을 바로 주지 않는다" 유지.

**성장 `student_topic_growth`**
- 주제별: 학습 세션 수·시간(`session_topics` 기준), 응시 수, 첫 정답률·최근 정답률(`total > 0`만), 최근 이해도.
- 신호: **같은 세션의** 응시 정답률과 성찰 이해도 짝으로 — 이해도 3 && 정답률 < 0.6 → `OVERCONFIDENT`, 그 외 < 0.4 → `LOW_SCORE`.
- 교사가 볼 때 기록 공유 동의가 없으면 `shared:false`, 정답률·이해도·신호는 `null`(횟수·시간만).

### 2-3. 테이블·RLS 초안
```sql
create table topics (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id),
  name text not null check (char_length(name) between 1 and 40),
  subject text,
  created_at timestamptz not null default now(),
  unique (class_id, name)
);
create table session_topics (
  session_id uuid not null references sessions(id) on delete cascade,
  topic_id uuid not null references topics(id),
  evidence_ids text[] not null check (cardinality(evidence_ids) >= 1),  -- entry id 또는 'goal'
  primary key (session_id, topic_id)
);
create table topic_questions (                       -- 반 단위 문항 풀 (정답 포함 → 학생 조회 금지)
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references topics(id) on delete cascade,
  type text not null check (type in ('MCQ','OX')),
  level text not null check (level in ('CONCEPT','APPLY')),
  prompt text not null check (char_length(prompt) <= 300),
  choices text[] not null,
  answer_index int not null,
  explanation text not null default '' check (char_length(explanation) <= 500),
  excluded boolean not null default false,
  created_at timestamptz not null default now()
);
create table quiz_serves (
  session_id uuid primary key references sessions(id) on delete cascade,
  topic_id uuid not null references topics(id),
  questions jsonb not null,                          -- [{id,type,prompt,choices(섞인),answerIndex(보정),explanation,reported}]
  created_at timestamptz not null default now()
);
create table quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references sessions(id) on delete cascade,  -- 세션당 1회
  topic_id uuid not null references topics(id),
  student_id uuid not null references users(id),
  correct int not null, total int not null,
  items jsonb not null,
  created_at timestamptz not null default now()
);
create table quiz_reports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  question_id uuid not null references topic_questions(id) on delete cascade,
  student_id uuid not null references users(id),
  reason text not null check (reason in ('WRONG_ANSWER','UNCLEAR','UNRELATED')),
  status text not null default 'OPEN' check (status in ('OPEN','KEEP_EXCLUDED','DISMISSED')),
  resolved_by uuid references users(id), resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (session_id, question_id)
);

alter table topics enable row level security;
alter table session_topics enable row level security;
alter table topic_questions enable row level security;
alter table quiz_serves enable row level security;
alter table quiz_attempts enable row level security;
alter table quiz_reports enable row level security;

-- 읽기만 정책으로 열고, 쓰기는 전부 함수(service_role)로
create policy topics_read on topics for select using (class_id = app_class());
create policy session_topics_read on session_topics for select
  using (owns_session(session_id) or teaches_shared_session(session_id));
create policy quiz_attempts_read on quiz_attempts for select
  using (owns_session(session_id) or teaches_shared_session(session_id));
-- topic_questions, quiz_serves, quiz_reports: 정책 없음 → 학생 직접 조회 불가 (정답 보호). 교사는 RPC로만.

create view v_topics with (security_invoker = true) as
  select id, class_id as "classId", name, subject from topics;
create view v_session_topics with (security_invoker = true) as
  select st.session_id as "sessionId", st.topic_id as "topicId", t.name, t.subject, st.evidence_ids as "evidenceIds"
  from session_topics st join topics t on t.id = st.topic_id;
create view v_quiz_attempts with (security_invoker = true) as
  select id, session_id as "sessionId", topic_id as "topicId", student_id as "studentId",
         correct, total, items, created_at as "createdAt" from quiz_attempts;
grant select on v_topics, v_session_topics, v_quiz_attempts to authenticated;

-- RPC student_topic_growth / class_reported_questions: class_dashboard 와 같은 방식(security invoker, 권한 검사 후 json)
--   - student_topic_growth: auth.uid() = p_student_id 또는 teaches_student(p_student_id), 아니면 NOT_FOUND
--   - class_reported_questions: app_role()='teacher' and app_class()=p_class_id, 정답·해설 포함 반환(교사만)
```

### 2-4. 백엔드에서 확인해 주시면 좋은 테스트 (프론트 mock 테스트와 같은 시나리오)
- 키워드 없는 기록만 있으면 주제 0개 / PRIVATE 기록은 주제 근거에서 제외
- "꼭짓점"과 "완전제곱식" 기록을 각각 남긴 두 세션이 같은 `topicId`로 묶임
- 같은 반 다른 학생, 같은 주제 → 같은 풀에서 출제 / 학생 응답에 `answerIndex`·`explanation` 없음
- 이번 세션 주제가 아닌 `topicId`로 출제 → `QUIZ_NOT_AVAILABLE` / 두 번째 제출 → `QUIZ_ALREADY_TAKEN`
- 1개 신고 → `total = 4` / 전부 신고 → `total = 0` / 교사 기각 → 재채점
- 다른 학생 세션의 주제·출제·신고 → 404

---

## 3. 프론트 진행 상황
- (2026-11-14 갱신) 백엔드 수정본 반영 완료. 실제 모드에서 동의·주제 테스트를 켰고, 학생 흐름(동의 → 학습 → AI 주제 → AI 5문항 → 신고 → 제출 → 내 성장)과 교사 화면(동의 가림, 신고 목록)을 실제 백엔드로 확인했습니다.

---

## 4. 추가 요청 v0.5.1 (프론트 최종 리뷰 결과, 2026-11-14)

- (2026-11-14 갱신) 백엔드가 4-1~4-9 모두 반영. 프론트 어댑터 연결 완료(대시보드 정답률, 동의 에러 코드 2개, `under14`, `by_guardian`).

프론트 mock은 아래 규칙으로 이미 바꾸고 테스트로 고정했습니다(`frontend/src/api/mockApi.test.ts` "최종 리뷰 수정 (주제별 성장)"). 백엔드도 맞춰 주세요.

| # | 우선 | 요청 | 이유 |
|---|---|---|---|
| 4-1 | **높음·개인정보** | `/sessions/:id/topics`·`/quiz`·`/summary`에서 학생의 최신 **AI 동의가 `granted=false`면 `403 CONSENT_REQUIRED`** | 세 함수 모두 학생 기록을 외부 LLM으로 보냄. 동의 화면은 "동의하지 않으면 AI로 보내지 않음"을 약속함. 프론트는 AI 미동의면 주제 단계를 건너뛰지만 서버에서도 막아야 함 |
| 4-2 | 높음 | 신고 `KEEP_EXCLUDED` 처리 시 **그 문항이 든 모든 `quiz_serves`·`quiz_attempts`에서 채점 제외 후 재채점**(신고하지 않은 학생 포함). 결과 항목에 `excluded: true` | 지금은 신고한 학생만 제외됨 → 잘못된 문항이 다른 학생 점수·성장·신호에 남음(설계의 반목표) |
| 4-3 | 중간 | `student_topic_growth` 각 주제에 `lastTotal`(최근 응시 채점 문항 수) 추가, **`lastTotal < 3`이면 `signal = null`** | 5문항 중 4개를 신고하면 1문항으로 "점수 낮음/이해했다는데 낮음" 신호가 뜸 |
| 4-4 | 중간·개인정보 | `class_reported_questions`에서 **기록 공유 미동의 학생의 신고는 `studentNumber`·`studentReportCount`를 `null`** | 성장 화면에선 미동의 학생의 주제를 숨기는데, 신고 목록으로 같은 정보가 드러남 |
| 4-5 | 중간 | 주제 근거 `evidenceIds`에서 **`"goal"`을 빼고 교사 공개 기록 1개 이상을 필수로** | 목표는 계획이지 공부한 근거가 아님. 목표만 쓰고 기록 없이 주제·테스트가 생길 수 있음 |
| 4-6 | 낮음 | `class_dashboard`에 `lastQuizRate`(최근 응시, `total > 0`만) 추가 | 지금은 값이 없어 프론트가 실제 모드에서 열을 숨김 |
| 4-7 | 낮음 | (가능하면) `v_me.under14` + `consents.by_guardian` 저장, 서버 check: under14 && granted && !by_guardian → 거부 | 만 14세 미만 보호자 동의. 이번에 어렵다면 **발표 자료에 한계로 명시** |
| 4-9 | 낮음 | `POST /sessions/:id/quiz` 응답 문항에 `reported: boolean` 추가 (출제 스냅샷 기준) | 새로고침하면 프론트가 신고 상태를 잃어 같은 문항을 다시 신고 → `unique(session_id, question_id)` 오류 가능 |
| 4-8 | 검토 | 문항 풀을 수준별 2배 이상으로 키우고, 같은 학생이 같은 주제에서 본 문항은 다시 내지 않기 | 같은 5문항 반복 + 제출 후 정답 공개 → 두 번째 응시 상승이 실력보다 암기일 수 있음 |

---

## 5. 추가 요청 v0.6 (교사 반 분석, 2026-11-14) — 백엔드 반영됨

| # | 요청 | 상태 |
|---|---|---|
| 5-1 | `class_dashboard` 학생 행에 `shared: boolean` | 반영. 프론트는 `shared === true`만 공유로 봄 |
| 5-2 | `ai_messages.question_type`(CONCEPT·CHECK·ANSWER·OTHER), `v_ai_messages.questionType` | 반영. null이면 프론트 규칙 분류 |
| 5-3 | 429·첫 출제 시간 측정 | 11번째 호출 429, 첫 출제 12.9초(재요청 0.3초) |
| 5-4 | 운영에서 `/dev/facepass/simulate` 404 | 끄면 404 확인, 데모용으로 켜 둠(운영 전 꺼야 함) |


---

## 6. 확인 요청 (대시보드 '피드백 기다림', 2026-11-14)

프론트가 `class_dashboard`의 `hasReflectionWithoutFeedback`을 대시보드 상태 카드·필터·배지로 쓰기 시작했다. 프론트 매퍼는 값을 그대로 넘기므로 아래 규칙은 서버가 지켜야 한다.

| # | 확인할 것 | 프론트 mock 기준 |
|---|---|---|
| 6-1 | 기록 공유(LEARNING_RECORD) 미동의·철회 학생은 `false` | `false` (돌아보기 존재 여부도 교사에게 알리지 않음) |
| 6-2 | 조회 기간(`p_from`~`p_to`) 안 세션의 돌아보기만 센다 | 최근 7일 안 세션만 |
| 6-3 | 내용이 빈 돌아보기(체크·남은 질문 없음)도 센다 | 센다 (돌아보기 행이 있으면) |
| 6-4 | 세션에 피드백이 하나라도 있으면 그 세션은 제외 | 제외 |

---

## 7. 추가 요청 (내 정리 탭 · 신고 AI 1차 검토, 2026-11-14)

### 7-1. [확인] 학생 '내 정리' 조회
프론트 `listMyNotes()`는 학생 본인 세션(`v_sessions`, `id` 정렬·페이지)을 읽고, 세션 ID를 100개씩 나눠 `v_entries`(`sessionId`,`id` 정렬)·`v_reflections`(`sessionId` 정렬)를 `.in("sessionId", ids)`로 읽는다.
- 학생 본인에게는 `PRIVATE` 기록도 `v_entries`에서 보여야 함 (RLS 확인 부탁)

### 7-2. [새 기능] 신고 AI 1차 검토 — `POST /sessions/:id/quiz/report`
사용자 결정: **같은 문항 기준**으로 첫 신고는 AI가 검토하고, 같은 문항이 다시 신고되면 교사에게. AI가 걸러 낸 신고도 학생별 신고 수에 센다.

| 경우 | 처리 | 응답 `review` |
|---|---|---|
| 같은 반에서 이 문항의 첫 신고 | LLM에 **문항만**(문제·선택지·정답·해설·신고 이유) 보내 검토. 학생 기록·이름은 보내지 않음 | AI 판단에 따라 |
| ↳ AI: 문제 없음 | 신고 행 `status='AI_CLEARED'`, `ai_review` 저장. **그 학생 채점에 포함**(스냅샷 `reported=false`) | `AI_OK` |
| ↳ AI: 오류 | 신고 행 `status='OPEN'`, `ai_review` 저장, 채점 제외 | `AI_ERROR` |
| 같은 문항의 두 번째 신고부터 | AI 호출 없이 `status='OPEN'`, 채점 제외 | `TO_TEACHER` |
| 같은 학생이 같은 출제 문항을 다시 신고 | 새 행 만들지 않고 앞 결과 그대로 | 앞 결과 |

- 응답: `{ review: "AI_OK" | "AI_ERROR" | "TO_TEACHER", message?: string }`. `review`가 없으면 프론트는 `TO_TEACHER`로 본다(지금 동작).
- AI 검토 출력 검증: `{ verdict: "OK" | "ERROR", reason: string(≤200자) }`. 형식이 틀리거나 시간 초과면 **`TO_TEACHER`로 처리**(교사 판단으로 넘김, 학생에게 오류를 보이지 않음).
- `class_reported_questions` 행에 추가: `aiReview: { verdict, reason } | null`(재신고 행엔 그 문항 첫 신고의 검토), `questionReportCount`(같은 반 같은 문항 신고 수, AI_CLEARED 포함), `status`에 `AI_CLEARED`. `studentReportCount`는 AI_CLEARED 포함.
- **동시성**: "같은 반 이 문항의 첫 신고" 판정은 원자적이어야 함. 두 학생이 동시에 신고해도 AI 검토는 한 번만 돌고 첫 신고는 하나만 생기게(예: `(class_id, question_id)` 단위 advisory lock 또는 첫 신고 표시용 unique 행).
- **교사 처리 `POST /quiz/reports/:id/resolve`**: `status='OPEN'`인 신고만 처리, 그 밖(`AI_CLEARED`·이미 처리)은 `VALIDATION`. 결정은 같은 반 **같은 문항의 열린 신고 전체**에 적용하고, DISMISS면 각 응시를 재채점.
- **출제 응답 `POST /sessions/:id/quiz`**: 문항마다 이미 신고했으면 `reportOutcome: { review, message }`를 같이 내려 주기(4-9 `reported` 확장). 새로고침해도 학생 화면의 "AI 확인 · 채점 포함" 안내가 유지됨.
- `questionReportCount`를 안 주면 프론트는 "-"로 표시(1로 꾸미지 않음).
- 남용: AI 호출은 문항당 한 번이라 비용이 커지지 않음. 학생별 호출 제한은 기존 원자적 제한에 포함 부탁.
- 프론트 mock 테스트(`mockApi.test.ts` "신고 AI 1차 검토")와 같은 시나리오로 확인 부탁.
