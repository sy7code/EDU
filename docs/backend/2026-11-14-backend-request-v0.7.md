# 백엔드 요청 v0.7 (프론트 → 백엔드, 2026-11-14)

프론트 master `d5aa086` 기준. 이 문서 하나만 읽어도 되도록 썼다. 이전 요청서(`2026-11-14-backend-request.md`) 6·7장과 내용이 같고, 여기서 명세를 더 구체화했다.

프론트는 아래 기능을 **mock으로 먼저 만들고 테스트로 고정**해 두었다. 백엔드가 반영하지 않아도 실제 모드는 지금처럼 동작한다(호환 처리는 각 절 끝 "프론트 호환" 참고).

## 0. 한눈에

| # | 우선 | 요청 | 종류 |
|---|---|---|---|
| A | 높음 | 신고 문항 **AI 1차 검토** (`POST /sessions/:id/quiz/report` 동작 변경) | 새 기능 |
| B | 높음 | 신고 처리 `resolve`: OPEN만 처리, **같은 문항의 열린 신고를 함께** 처리 | 동작 변경 |
| C | 중간 | 출제 응답 문항에 `reportOutcome` | 응답 필드 추가 |
| D | 중간 | `class_reported_questions` 행에 `aiReview`, `questionReportCount`, 상태 `AI_CLEARED` | 응답 필드 추가 |
| E | 중간 | 대시보드 `hasReflectionWithoutFeedback` 규칙 확인 (4가지) | 확인 |
| F | 중간 | 학생 '내 정리': 본인 `PRIVATE` 기록이 `v_entries`에서 보이는지 | 확인 |
| G | 낮음 | 피드백 `read_at`을 **서버 시각**으로 | 동작 변경 |
| H | 운영 | 데모 시간대 공유 DB에서 백엔드 회귀 테스트 금지 합의 | 합의 |

---

## A. 신고 문항 AI 1차 검토 (높음)

### 결정 (사용자)
- 문항의 **첫 신고는 AI가 검토**, 같은 문항이 **다시 신고되면 교사에게**. 기준은 "같은 반·같은 문항".
- 일부러든 실수든 신고가 남용될 수 있으므로 **AI가 걸러 낸 신고도 학생별 신고 수에 센다**.

### 동작

| 경우 | 처리 | 응답 `review` |
|---|---|---|
| 같은 반에서 이 문항의 **첫 신고** | LLM에 **문항만** 보내 검토 (아래 "AI 입력") | AI 판단에 따라 |
| ↳ AI: 문제 없음 | 신고 행 `status='AI_CLEARED'`, `ai_review` 저장. **그 학생 채점에 포함**(출제 스냅샷 `reported=false` 유지) | `AI_OK` |
| ↳ AI: 오류 | 신고 행 `status='OPEN'`, `ai_review` 저장. 스냅샷 `reported=true`(채점 제외) | `AI_ERROR` |
| ↳ AI 실패(시간 초과·형식 오류) | **교사에게 넘김**: `status='OPEN'`, `ai_review=null`, 채점 제외. 학생에게 오류를 보이지 않음 | `TO_TEACHER` |
| 같은 문항의 **두 번째 신고부터** | AI 호출 없이 `status='OPEN'`, 채점 제외 | `TO_TEACHER` |
| 같은 학생이 같은 출제 문항을 **다시 신고** | 새 행 없이 **앞 결과 그대로** 반환 (`unique(session_id, question_id)`) | 앞 결과 |

### 응답
```json
{ "review": "AI_OK" | "AI_ERROR" | "TO_TEACHER", "message": "학생에게 보여 줄 한두 문장(선택)" }
```
`message`를 비우면 프론트 기본 문구를 쓴다.

### AI 입력·출력
- 입력: 문제, 선택지, 정답 번호, 해설, 신고 이유(`WRONG_ANSWER | UNCLEAR | UNRELATED`), 주제 이름. **학생 기록·이름·번호는 보내지 않는다.** (그래서 AI 동의와 무관하게 돌려도 됨. 다르게 판단하면 알려 주세요.)
- 출력(JSON): `{ "verdict": "OK" | "ERROR", "reason": "200자 이내" }`. 형식이 틀리면 실패로 보고 `TO_TEACHER`.
- 지시 예: "교과서 기본 수준 문항이다. 정답 번호가 해설과 맞는지, 선택지에 정답이 하나뿐인지, 문장이 모호하지 않은지 확인한다. 확신이 없으면 ERROR로 답한다." (애매하면 교사에게 가는 쪽이 안전)

### 동시성 (중요)
"첫 신고" 판정은 **원자적**이어야 한다. 두 학생이 동시에 신고해도 AI 검토는 한 번, 첫 신고는 하나.

SQL 초안 (이름은 기존 스키마에 맞춰 조정):
```sql
-- 상태 추가 (기존 check 제약 이름은 확인 후 교체)
alter table quiz_reports drop constraint quiz_reports_status_check;
alter table quiz_reports add constraint quiz_reports_status_check
  check (status in ('OPEN','KEEP_EXCLUDED','DISMISSED','AI_CLEARED'));
alter table quiz_reports add column ai_review jsonb;  -- { verdict, reason } | null

-- 반·문항별 첫 신고 표시 (PK로 원자성 보장)
create table quiz_question_reviews (
  class_id uuid not null references classes(id) on delete cascade,
  question_id uuid not null references topic_questions(id) on delete cascade,
  verdict text check (verdict in ('OK','ERROR')),   -- AI 결과 전에는 null
  reason text,
  created_at timestamptz not null default now(),
  primary key (class_id, question_id)
);
alter table quiz_question_reviews enable row level security;  -- 정책 없음: 함수(service_role)만
```
처리 순서:
1. `insert into quiz_question_reviews (class_id, question_id) values (...) on conflict do nothing returning *`
2. 행이 돌아오면 **첫 신고** → AI 호출 → `verdict, reason` 갱신 → 위 표대로.
3. 행이 안 돌아오면 **두 번째 이후** → `TO_TEACHER`. (첫 신고의 AI가 아직 진행 중이어도 두 번째는 교사에게. 그래도 됨)

### 남용·비용
- AI 호출은 반·문항당 최대 한 번이라 비용이 늘지 않음.
- 학생별 신고 호출은 기존 원자적 호출 제한에 포함해 주세요.

### 프론트 호환
- 응답에 `review`가 없거나 모르는 값이면 프론트는 `TO_TEACHER`로 본다 = 지금과 같은 동작.

---

## B. 신고 처리 `POST /quiz/reports/:id/resolve` (높음)

- `status='OPEN'`인 신고만 처리. `AI_CLEARED`·이미 처리한 신고면 **`VALIDATION`**(400).
- 결정은 같은 반 **같은 문항의 OPEN 신고 전체**에 적용 (같은 문항에 결론이 둘로 갈리지 않게).
  - `KEEP_EXCLUDED`: 기존 4-2와 같음(문항 제외, 그 문항이 든 모든 출제·응시 재채점).
  - `DISMISS`: 함께 처리한 신고마다 스냅샷 `reported=false`, 제출했으면 재채점.

---

## C. 출제 응답에 `reportOutcome` (중간)

`POST /sessions/:id/quiz` 응답 문항마다, 이 세션에서 이미 신고했다면:
```json
{ "id": "...", "type": "MCQ", "prompt": "...", "choices": ["..."], "reported": false,
  "reportOutcome": { "review": "AI_OK", "message": "..." } }
```
- 4-9의 `reported` 확장. `AI_OK`는 `reported=false`라 이것이 없으면 새로고침 후 학생 화면의 "AI 확인 · 채점 포함" 안내가 사라지고 신고 버튼이 다시 나온다.
- 저장 위치 제안: `quiz_serves.questions` jsonb의 문항별 `reportOutcome`.

---

## D. `class_reported_questions` 행 필드 (중간)

| 필드 | 값 |
|---|---|
| `status` | 기존 + `AI_CLEARED` (프론트는 교사 확인 목록에서 빼고 학생별 신고 수에만 셈) |
| `aiReview` | `{ verdict, reason }` 또는 `null`. **재신고 행에는 그 문항 첫 신고의 검토**를 넣어 주세요 |
| `questionReportCount` | 같은 반·같은 문항 신고 수(`AI_CLEARED` 포함). 안 주면 프론트는 "-" 표시 |
| `studentReportCount` | **`AI_CLEARED` 포함**으로 집계. 기록 공유 미동의면 지금처럼 `null`(4-4) |

`AI_CLEARED` 행도 목록에 내려 주세요(학생별 신고 수 계산에 필요).

---

## E. 대시보드 `hasReflectionWithoutFeedback` 확인 (중간)

프론트가 이 값을 대시보드 "피드백 기다림" 카드·필터·배지로 쓰기 시작했다. 값을 그대로 쓰므로 서버가 지켜야 한다.

| # | 확인할 것 | 프론트 mock 기준 |
|---|---|---|
| E-1 | 기록 공유(LEARNING_RECORD) 미동의·철회 학생은 `false` | `false` |
| E-2 | 조회 기간(`p_from`~`p_to`) 안 세션의 돌아보기만 센다 | 최근 7일 |
| E-3 | 내용이 빈 돌아보기(체크·남은 질문 없음)도 센다 | 센다 |
| E-4 | 세션에 피드백이 하나라도 있으면 그 세션은 제외 | 제외 |

참고: 프론트는 학생 행의 `shared`가 `true`일 때만 남은 질문·정답률 기반 판단 문장을 보여 준다(값이 없으면 비공개로 봄). `shared`는 지금처럼 꼭 내려 주세요.

---

## F. 학생 '내 정리' 조회 확인 (중간)

프론트 `listMyNotes()`:
1. `v_sessions`에서 `studentId = 본인`을 `id` 정렬로 페이지 조회
2. 세션 ID를 100개씩 나눠 `v_entries`(`sessionId`, `id` 정렬), `v_reflections`(`sessionId` 정렬)를 `.in("sessionId", ids)`로 조회

확인 부탁:
- 학생 본인에게 **`PRIVATE` 기록도 `v_entries`에서 보이는지** (교사에게는 계속 안 보여야 함)
- 위 정렬 컬럼으로 range 페이지 조회가 되는지

---

## G. 피드백 `read_at`을 서버 시각으로 (낮음)

지금 프론트는 `update feedback set read_at = <브라우저 시각> where id = ... and read_at is null`을 보낸다. 학생 기기 시계가 틀리면 "읽은 시각"이 틀린다.
- 제안: `before update` 트리거로 `read_at`이 null → 값으로 바뀔 때 `new.read_at := now()`. 프론트는 그대로 둬도 서버 시각으로 저장됨.

---

## H. 데모 운영 합의 (운영)

- 데모(리허설 포함) 시간대에는 공유 DB에서 백엔드 회귀 테스트를 돌리지 않기. 같은 데모 계정을 동시에 쓰면 진행 중 세션·토큰이 꼬인다(지난번 실패 3건 원인).
- 시드를 다시 깔면 `backend/scripts/backfill_question_types.py`도 다시 돌리기.
- 데모 후: `ALLOW_DEV_SIMULATE` 끄기, 동의 기록 없으면 미동의로.

---

## 확인 시나리오 (프론트 mock 테스트와 같음)

`frontend/src/api/mockApi.test.ts`의 "신고 AI 1차 검토" 묶음:
1. 첫 신고 AI_OK → 응답 `AI_OK`, 제출 시 `total=5`, 교사 목록 행 `AI_CLEARED`·`aiReview.verdict=OK`·`questionReportCount=1`·`studentReportCount=1`
2. 첫 신고 AI_ERROR → `AI_ERROR`, `total=4`, 행 `OPEN`·`aiReview.verdict=ERROR`
3. 학생 A 첫 신고(AI_OK) 후 학생 B가 같은 문항 신고 → B는 `TO_TEACHER`, AI 호출 1번, B `total=4`, OPEN 행 `aiReview=OK`(첫 검토)·`questionReportCount=2`
4. 같은 학생이 같은 문항 재신고 → 같은 결과, 행 1개, AI 호출 1번
5. 새로 출제 응답을 받아도 `reportOutcome.review=AI_OK` 유지
6. `AI_CLEARED` 행 resolve → `VALIDATION`, 이미 처리한 행 resolve → `VALIDATION`
7. 같은 문항 OPEN 2건 중 하나 DISMISS → 둘 다 `DISMISSED`, 두 응시 모두 `total=5`로 재채점

질문이나 다르게 하고 싶은 부분은 프론트에 알려 주세요.
