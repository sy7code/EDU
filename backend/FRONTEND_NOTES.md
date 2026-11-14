# 프론트 전달 사항 (백엔드 → 프론트)

> 기준: `api-spec.md` v0.1. 백엔드 진행에 따라 갱신 (최종 수정 2026-11-13)

## 접속 정보

- Supabase URL: `https://acniqyitennfxflhiifg.supabase.co` (서울 리전)
- 프론트에는 `anon` 키만 사용 (Settings > API Keys). `service_role` 키는 프론트에 넣지 않음.
- 로직 함수 기본 주소: `https://acniqyitennfxflhiifg.supabase.co/functions/v1/api` + 명세 경로 그대로 (배포됨)
- 함수 호출 헤더: `Authorization: Bearer <로그인 access token>`, `Content-Type: application/json`

## 함수 엔드포인트 (전부 POST, 명세 형식 그대로 camelCase)

| 경로 | 요청 body | 성공 |
|---|---|---|
| ~~`/dev/facepass/simulate`~~ | v1.2에서 제거 (QR 사용) | 404 |
| `/sessions` | `{ "studentId", "goal", "authEventId" }` | 201 LearningSession |
| `/sessions/:id/end` | `{ "authEventId" }` (종료용으로 simulate 한 번 더) | 200 LearningSession |
| `/sessions/:id/ai/messages` | `{ "content" }` (최대 1000자) | 200 AI 메시지 (5초 안팎 걸림 → 로딩 표시) |
| `/sessions/:id/summary` | 없음 | 200 `{ activities, remainingQuestions }` (ENDED만, 두 번째부터 캐시) |

### 실제 FacePass 단말기용 (미리 준비, 실기기 연동은 2일차 확인 후)

| 경로 | 호출 주체 | 요청 | 성공 |
|---|---|---|---|
| `POST /facepass/result` | 토스 단말기 플러그인 (로그인 없음) | 헤더 `X-Device-Token: <기기 토큰>`, body = `listenData` 콜백 값 그대로 `{ merchantUserKey, authenticated, result, message }` | 201 `{ id, success, result, studentName(마스킹 "학**1"), verifiedAt }` |
| `GET /auth-events/latest` | 학생 앱 (로그인) | 없음 | 200 auth_event (2분 안 성공·미사용 최신 1건) → 이 `id`로 `/sessions` 시작·종료 |

- 흐름: 단말기 `sdk.facePass.listenData(cb)` → `start()` → cb에서 `/facepass/result`로 POST → 학생 앱이 `/auth-events/latest`로 받아서 세션 시작
- 기기 토큰은 팀 채널로 따로 전달 (코드·Git에 넣지 말 것). 에러: 토큰 없음/틀림 401, 모르는 학생 키 404 `UNKNOWN_USER`
- 현재 학생01의 `merchantUserKey`는 임시값 `TEST-STUDENT01`. 실제 매핑 방식은 2일차 확인 후 교체

함수 에러는 명세 형식 `{ "error": { "code", "message" } }`. `message`는 화면에 그대로 띄워도 되는 한국어 문장.
주요 code: `UNAUTHORIZED`(401), `FORBIDDEN`(403), `NOT_FOUND`(404), `SESSION_ALREADY_ACTIVE`·`SESSION_ALREADY_ENDED`·`AUTH_EVENT_INVALID`·`SESSION_NOT_ACTIVE`·`SESSION_NOT_ENDED`(409), `TOO_LONG`(400), `RATE_LIMITED`(429), `AI_TIMEOUT`(504), `AI_UNAVAILABLE`(502).
인증 이벤트는 **2분 안에 1번만** 쓸 수 있음 → 시작·종료마다 simulate를 새로 호출.

## 명세와 달라진 점

| 항목 | 명세 | 실제 |
|---|---|---|
| 읽기 | `GET /me` 등 REST 경로 | supabase-js로 **`v_*` view 조회** → 응답이 camelCase |
| 쓰기 (F4·F7·F8) | `POST /sessions/:id/entries` 등 | supabase-js로 **원본 테이블에 snake_case로 insert** |
| F9 대시보드 | `GET /classes/:id/dashboard` | RPC `class_dashboard(p_class_id, p_from, p_to)` |
| F9 필드 | `hasUnreadReflection` | **`hasReflectionWithoutFeedback`** (읽음 기록 테이블이 없어서 "피드백 없는 성찰 있음"으로 대체) |
| F2 인증 | 키오스크 + 웹훅 | 데모는 학생 화면 "인증(데모)" 버튼 → `POST /dev/facepass/simulate` → 받은 `authEventId`로 `POST /sessions` |
| 키오스크·QR·Realtime·동의·감사 로그 | 구현 | **이번엔 구현 안 함** (발표 설계 슬라이드로) |

FacePass 참고: 토스 문서상 단말기 프론트 SDK(`sdk.facePass.listenData`)로만 결과가 오고 웹훅·서버 검증은 없음. 실연동 방식은 2일차 확인.

## 읽기: view 목록 (전부 RLS 적용)

| view | 컬럼 |
|---|---|
| `v_me` | id, name, role, classId, number |
| `v_students` | id, name, classId, number |
| `v_sessions` | id, studentId, goal, startedAt, endedAt, startAuth, endAuth, status, durationMinutes, summary |
| `v_entries` | id, sessionId, kind, content, visibility, createdAt |
| `v_ai_messages` | id, sessionId, role, content, createdAt |
| `v_reflections` | sessionId, changed, remainingQuestions, updatedAt |
| `v_feedback` | id, sessionId, teacherId, content, createdAt |

```js
const { data: me } = await supabase.from('v_me').select().single()
const { data } = await supabase.from('v_sessions').select().eq('studentId', id).order('startedAt', { ascending: false })
```

## 쓰기: 테이블 직접 (snake_case)

```js
// F4 기록 — ACTIVE 세션에만 가능, content 최대 2000자
await supabase.from('entries').insert({ session_id, kind: 'QUESTION', content, visibility: 'TEACHER' })

// F7 성찰 — 덮어쓰기
await supabase.from('reflections').upsert({ session_id, changed, remaining_questions: ['...'] })

// F8 교사 피드백
await supabase.from('feedback').insert({ session_id, teacher_id: me.id, content })

// F9 대시보드
await supabase.rpc('class_dashboard', { p_class_id: me.classId, p_from: '2026-11-09', p_to: '2026-11-15' })
```

## 에러

| 상황 | HTTP | supabase-js `error` |
|---|---|---|
| 종료된 세션에 기록 추가 | 409 | `{ code: "SESSION_NOT_ACTIVE", message: "진행 중인 학습에만 기록할 수 있어요." }` |
| 다른 반 대시보드 / 학생이 교사용 RPC 호출 | 404 | `{ code: "NOT_FOUND", message: "찾을 수 없어요." }` |
| 남의 세션에 쓰기 | 403 | code `42501` (`new row violates row-level security policy`) |
| 권한 없는 조회 | 200 | 에러 없이 **0건** (RLS) |

## 2026-11-14 요청 반영 (1-1 ~ 1-4)

| # | 반영 내용 |
|---|---|
| 1-1 동의 | `consents` 테이블 + `v_consents` view. 교사는 학생의 **최신 `LEARNING_RECORD` 동의가 `granted=false`면** 그 학생의 기록·성찰·AI 대화·요약(함수 포함)을 못 봄. 학생 본인만 insert: `supabase.from('consents').insert({ student_id, kind, granted, policy_version })`. 동의 기록이 아예 없으면 **공유로 간주**(데모 호환) → 발표 한계로 명시 필요 |
| 1-1 마스킹 | `ai_messages`의 학생 메시지는 이제 **마스킹본 저장** (`010-...` → `[연락처]`) |
| 1-2 성찰 | `reflections`에 `checks text[]`, `understanding int(1~3)`, `note text(≤500)` 추가, `changed`는 기본값 `''`. `v_reflections`에 `checks, understanding, note` 노출 |
| 1-3 PAPER | `entries.kind`에 `PAPER` 허용, PAPER만 빈 `content` 허용 |
| 1-4 latest | `GET /auth-events/latest` 인증 없으면 **200 + `null`** |

- 시드: 학생03은 기록 공유 **미동의** 상태 (교사 화면 가림 데모용)
- DB를 새로 만들었으므로 11-14 연결 테스트 데이터는 지워졌고 시드가 새로 생성됨 (ID 전부 바뀜, 데모 계정은 그대로)

## 주제별 성장 + 객관적 테스트 (명세 v0.5 반영) — `FEATURES.quiz` 켜도 됨

함수 (전부 `POST /functions/v1/api...`, 에러 형식 기존과 동일)

| 경로 | 요청 | 성공 | 비고 |
|---|---|---|---|
| `/sessions/:id/topics` | 없음 | `{ topics: [{ topicId, name, subject, evidenceIds }] }` | ENDED만. 두 번째부터 캐시. 근거 없으면 `[]` |
| `/sessions/:id/quiz` | `{ topicId }` | `{ topic: { id, name }, questions: [{ id, type, prompt, choices }] }` | 정답·해설 없음. 다시 불러도 같은 스냅샷. 첫 출제는 AI 문제 생성 때문에 **오래 걸릴 수 있음**(시간 측정 전, 로딩 표시 필요). 같은 주제 두 번째부터는 풀 재사용이라 빠름 |
| `/sessions/:id/quiz/report` | `{ questionId, reason }` | `{ ok: true }` | 제출 전만 |
| `/sessions/:id/quiz/submit` | `{ answers: { [questionId]: number \| null } }` | 201 `QuizAttempt` (items에 정답·해설 포함) | 세션당 1회 |
| `/quiz/reports/:id/resolve` | `{ action: "KEEP_EXCLUDED" \| "DISMISS" }` | `{ ok: true }` | 교사(자기 반). DISMISS → 재채점 |

RPC
```js
await supabase.rpc('student_topic_growth', { p_student_id })   // { shared, topics: [TopicGrowth] }
await supabase.rpc('class_reported_questions', { p_class_id })  // [ReportedQuestion] + studentReportCount(학생별 신고 수)
```
view: `v_topics`, `v_session_topics`, `v_quiz_attempts` (요청서 컬럼 그대로)

에러 코드 추가: `QUIZ_NOT_AVAILABLE`(409: 진행 중 세션 / 이번 세션 주제 아님 / 이미 다른 주제로 출제됨 / 출제 전 제출), `QUIZ_ALREADY_TAKEN`(409: 두 번째 제출, 제출 후 신고), `AI_BAD_OUTPUT`(502: AI가 문제·주제를 형식대로 못 만듦 → 재시도)

요청서와 다른 점
- `ReportedQuestion`에 `studentReportCount` 추가 (신고 남발 판단용)
- `student_topic_growth`의 `firstRate`·`lastRate`는 소수 둘째 자리 반올림 (예: 0.8)
- AI 도우미 수준 맞춤: 최근 테스트 정답률 3건 + 최근 이해도를 시스템 프롬프트에 참고로 넣음 (정답 바로 안 주는 규칙 유지)

## v0.5.1 반영 (4-1 ~ 4-8) — 전부 반영

| # | 반영 내용 |
|---|---|
| 4-1 | 학생 최신 `AI` 동의가 `granted=false`면 `/topics`·`/quiz`·`/summary`(학생·교사 모두)·**`/ai/messages`도** → `403 CONSENT_REQUIRED`. 신고·제출은 LLM 안 써서 막지 않음 |
| 4-2 | `KEEP_EXCLUDED` → 그 문항이 나간 **모든 응시**를 신고 여부와 상관없이 재채점. `items[].excluded: true` 추가 (`reported`는 "이 학생이 신고했는지"로 의미 유지) |
| 4-3 | `student_topic_growth` 주제마다 `lastTotal` 추가, `lastTotal < 3`이면 `signal = null` |
| 4-4 | `class_reported_questions`: 기록 공유 미동의 학생 신고는 `studentNumber`·`studentReportCount` = `null` |
| 4-5 | 주제 근거에서 `"goal"` 제외, 교사 공개 기록 1개 이상 필수 (목표만 있으면 주제 0개) |
| 4-6 | `class_dashboard` 학생마다 `lastQuizRate` (최근 응시, `total>0`만, 소수 둘째 자리). 기록 공유 미동의 학생은 `null` |
| 4-7 | `users.under14`, `v_me.under14` 추가. under14 학생이 `granted=true`·`by_guardian=false`로 insert → `403 GUARDIAN_CONSENT_REQUIRED` (거부·철회는 허용). **한계: `by_guardian`은 자기 신고값이라 실제 보호자 인증은 아님 → 발표에 명시** |
| 4-8 | 문항 풀을 수준별 **2배 이상**(개념 6·적용 4)으로 키우고, 같은 학생이 같은 주제에서 본 문항은 다시 안 냄 (안 본 문항이 모자라면 새로 생성, 그래도 모자라면 본 문항으로 채움) |
| 4-9 | `POST /sessions/:id/quiz` 응답 문항마다 `reported: boolean` (이 세션에서 이미 신고한 문항). 참고: 같은 문항 중복 신고는 원래도 에러 없이 `{ ok: true }` |

- 4-8 때문에 첫 출제는 문항을 10개 만들어서 이전보다 더 오래 걸릴 수 있음 (로딩 표시)

## v0.6 반영 (5-1 ~ 5-4)

| # | 반영 내용 |
|---|---|
| 5-1 | `class_dashboard` 학생마다 `shared: boolean` (최신 `LEARNING_RECORD`가 false가 아니면 true) → `student_topic_growth` 30번 호출 불필요 |
| 5-2 | `ai_messages.question_type` (`CONCEPT`·`CHECK`·`ANSWER`·`OTHER`, 학생 메시지만, AI 답변 행은 null). `/ai/messages`에서 답변 생성과 **동시에** 분류(응답 시간 변화 없음). `v_ai_messages.questionType` 노출. 분류 실패 시 null → 프론트 규칙 분류로 대체 |
| 5-4 | `ALLOW_DEV_SIMULATE`를 `false`로 바꾸면 `/dev/facepass/simulate` → **404 확인** (11-14 실측 후 데모용으로 다시 `true`) |

5-3 측정 결과 (2026-11-14, 배포된 함수)
- **분당 10회 제한**: 1분 안 누적 11번째 호출에서 `429 RATE_LIMITED` 확인 (앞 10번 200)
- **첫 출제 `/quiz`** (문항 10개 생성): **12.9초** (1회 측정, 이전 실행 11.5초). 같은 세션 재요청은 0.3초
- 참고: 호출 제한은 "요청 시작 시점의 개수"로 판단해서, **동시에 여러 요청**을 보내면 잠깐 10회를 넘을 수 있음 (순차 호출은 정확히 막힘)

## 2026-11-14 데모 데이터·추가 기능

**시드 보강 (반 분석이 비던 문제)**
- 원인: 백엔드 테스트 때마다 시드를 다시 깔았는데 시드에 주제·응시가 없어서 지워졌음
- 이제 시드에 반 주제 6개(이차함수 꼭짓점, 영어 주제문 찾기, 비문학 지문 구조, 조건부확률, 몰과 화학식량, 일제 강점기 통치 방식), 주제별 문항 5개, **응시 약 65건(24명)**, 성찰 이해도·체크리스트, 피드백(일부 읽음) 포함
- 학생09 = "이해했다는데 점수 낮음"(OVERCONFIDENT), 학생03 = 기록 공유 미동의
- **AI 질문 유형**: 시드 학생 질문 135개를 서버와 같은 분류 프롬프트·모델로 채움 (`backend/scripts/backfill_question_types.py`). 시드를 다시 깔면 이 스크립트도 다시 돌려야 함
- 분류 프롬프트 보정: "공부 방법·일정" 질문이 ANSWER로 잡히던 것 → OTHER로 (ANSWER는 문제·과제의 답 요청만)

**피드백 읽음**
```js
await supabase.from('feedback').update({ read_at: new Date().toISOString() }).eq('id', feedbackId)  // 학생 본인 것만, read_at만 수정 가능
// v_feedback.readAt (null = 새 피드백)
```

**교사 열람 기록** (`FEATURES.audit` 켜도 됨)
```js
await supabase.rpc('log_student_view', { p_student_id })   // 교사가 학생 상세를 열 때 호출 (자기 반만, 아니면 404)
await supabase.from('v_audit_logs').select()                // 학생: 누가 언제 내 기록을 봤는지 / 교사: 내가 연 기록
// { id, actorId, actorName, action: 'VIEW_STUDENT_DETAIL', studentId, createdAt }
```

**호출 제한 원자화**: 분당 10회·하루 200회를 DB 잠금 안에서 셈 → 동시 12개 요청에서 정확히 10개만 200, 2개 429 확인

**주의 (공유 DB)**: 지금 데모 DB 하나를 프론트·백엔드가 같이 씀. 백엔드가 시드를 다시 깔면 프론트가 만든 데이터와 ID가 사라지고, 프론트에서 데모 계정으로 로그아웃하면(supabase-js `signOut()` 기본값 global) 그 계정의 다른 로그인도 끊김 → 백엔드는 이제 시드 재설치를 하지 않음. 필요하면 미리 말하고 진행

## v0.7 반영 (A ~ H) — 배포됨

| # | 반영 내용 |
|---|---|
| A | `POST /sessions/:id/quiz/report` 응답이 **`{ review: "AI_OK" \| "AI_ERROR" \| "TO_TEACHER", message }`** 로 바뀜 (기존 `{ ok: true }` 아님). 반·문항 첫 신고만 AI 검토(문항·선택지·정답·해설·신고 이유·주제 이름만 전송, 학생 정보 없음 → AI 동의와 무관하게 실행). AI_OK면 `AI_CLEARED`·채점 포함, AI_ERROR면 `OPEN`·채점 제외, AI 실패·두 번째 신고부터는 `TO_TEACHER`. 첫 신고 판정은 PK로 원자적. 같은 학생 재신고는 앞 결과 그대로. 신고도 분당 10회 호출 제한에 포함 |
| B | `resolve`: `OPEN`만 처리, 아니면 **400 `VALIDATION`**. 같은 반·같은 문항 OPEN 신고 전체에 같은 결정 (DISMISS면 함께 처리한 응시 모두 재채점) |
| C | 출제 응답 문항에 `reportOutcome: { review, message }` (이 세션에서 신고했을 때만). `reported`는 이제 **채점에서 빠진 신고(OPEN·KEEP_EXCLUDED)** 만 true → AI_OK·DISMISSED는 false |
| D | `class_reported_questions` 행에 `aiReview`(재신고 행에도 첫 검토), `questionReportCount`(같은 반·문항, AI_CLEARED 포함), `status` 에 `AI_CLEARED`. `studentReportCount`는 AI_CLEARED 포함 (미동의 학생은 계속 null) |
| E | `hasReflectionWithoutFeedback` 4가지 모두 확인: 미동의·철회 → false / 조회 기간 안 세션만 / 빈 돌아보기도 셈 / 피드백 있는 세션 제외. `shared`는 계속 내려줌 |
| F | 학생 본인은 `v_entries`에서 `PRIVATE`도 보임(교사는 안 보임). `.in("sessionId", ids)` + `order=sessionId,id` + range 페이지 조회 동작 확인 |
| G | `read_at`은 서버 시각으로 저장(브라우저 시각 무시), 한 번 읽으면 바뀌지 않음 → 프론트 수정 필요 없음 |
| H | 동의. 이번 v0.7 테스트는 **테스트 전용 반·계정**에서 돌리고 끝난 뒤 삭제함 (데모 반·데모 계정 미사용, 시드 재설치 안 함). DB 변경은 데이터를 지우지 않는 `migrations/2026-11-14_v0.7.sql` 로 적용 |

- 확인 시나리오 1~7 + E·F·G 테스트 28/28 통과 (AI 판정: 정답이 맞는 문항 → OK, 정답 번호를 일부러 틀린 문항 → ERROR. AI 판단이라 1회 기준)
- 첫 신고는 AI 검토 때문에 응답이 몇 초 걸릴 수 있음 (로딩 표시)

## v0.8 반영 (A ~ D) — 배포됨

| # | 반영 내용 |
|---|---|
| A | **`POST /sessions/:id/ocr`** `{ image: "data:image/jpeg;base64,..." }` → `{ text }`. 본인·ACTIVE 세션만(404/409), AI 동의 철회 시 403 `CONSENT_REQUIRED`, JPEG·PNG만·디코딩 2MB 이하(400 `VALIDATION`), 분당 10회 제한 포함. 줄 단위 원문, 빈 줄 정리, 2000자 컷, 이름·연락처 마스킹. **사진은 저장·로그 안 함**. 저장은 하지 않으니 프론트가 확인 후 `entries`에 `PAPER`로 insert |
| B | `sessions_single_per_user = false` 확인 (휴대폰 로그인해도 PC 안 끊김). 같은 학생 두 로그인 토큰으로 같은 세션에 각각 기록 insert 성공. CORS는 `Access-Control-Allow-Origin: *` 라 휴대폰 브라우저·배포 주소 모두 통과 |
| C | 교사 `v_sessions`(eq studentId)·`v_entries`/`v_reflections`(in sessionId) 읽기 확인, 기록 공유 미동의 학생은 `v_reflections` 0건(세션 목록은 보임), 학생 본인은 다 보임 |
| D | `entries` Realtime 켬 (`supabase_realtime` 발행 대상, RLS 적용). `postgres_changes` insert 구독 가능 |

- OCR 응답 시간: 1200×700 메모 사진 기준 약 3초 (로컬 측정 1회)
- 테스트 이미지는 **컴퓨터 글꼴로 만든 메모**였음 → 실제 손글씨 인식 정확도는 확인 전 (실기기로 한 번 찍어 보기 권장)
- 함수 로그에 이미지가 안 남는지는 코드로 보장(본문 로깅 없음). 로그 조회 API가 막혀 있어 실제 로그 확인은 못 함 → 대시보드 Edge Functions > api > Logs에서 확인 가능
- 테스트 11/11 통과 (테스트 전용 반·계정, 끝난 뒤 삭제)

## v0.9 반영 (A ~ G) — 배포됨

| # | 반영 내용 |
|---|---|
| A | `teacher_assignments`(쓰기는 service_role만, `기타` 불가), `current_term(ts)`(서울 기준), **`v_my_assignments`** `{ teacherId, classId, subject, term }` (학생·배정 없는 교사는 0행) |
| B | `consents.kind`에 `SUBJECT_SHARE`. 행 없으면 false. `LEARNING_RECORD`가 꺼지면 `SUBJECT_SHARE` 값과 무관하게 안 보임 (서버 강제). 만 14세 미만은 **기존 보호자 동의 규칙이 그대로 적용**됨 (`granted=true`는 `by_guardian=true`여야 저장, 아니면 403 `GUARDIAN_CONSENT_REQUIRED`) |
| C-0 | `sessions.subject` (`국어·수학·영어·사회·과학·기타`, 기본 `기타`). **`POST /sessions` 본문에 `subject`를 보내 주세요** (안 보내면 `기타` = 교과 교사에게 안 보임, 목록 밖이면 400 `VALIDATION`). 시작 후 변경 불가. `v_sessions.subject`, 응답에도 `subject`. 기존 세션은 주제 과목으로 백필(화학→과학, 한국사→사회) |
| C | 교과 교사 읽기 = 현재 학기 배정(반+과목) + 세션이 현재 학기 시작 + 두 동의. `v_sessions`·`v_entries`(TEACHER만)·`v_reflections`·`v_quiz_attempts`·`v_session_topics`·`v_feedback`. **`v_ai_messages`는 0행**. 배정 반의 `v_topics`·`classes` 이름도 읽힘 |
| D | 교과 교사 `feedback` insert 허용. `teacher_id`·`author_subject`는 서버가 덮어씀 (담임이 쓰면 `null`, 교과 교사면 세션 과목). `v_feedback.authorSubject` |
| E | `rpc log_student_view({ p_student_id, p_subject? })`. 담임이면 `subject=null`, 교과 교사는 `p_subject` 필수(없거나 권한 밖이면 404). `v_audit_logs.subject` |
| F | `rpc subject_students({ p_class_id, p_subject })` → `[{ id, name, classId, number }]`, `rpc subject_week_summary({ p_class_id, p_subject })` → `SubjectWeekSummary` 그대로. 배정 없으면 404 `NOT_FOUND` |
| 추가 | `POST /sessions/:id/summary` 교과 교사 허용(같은 열람 조건). 입력에서 **AI 대화 제외**, 담임·학생용 요약과 따로 저장. 그래서 교과 교사에게 `v_sessions.summary`는 `null` → 교과 교사 화면은 summary API 응답을 쓰세요 |

- 거부 테스트(요청서 G 1~13) + 추가 항목 **30/30 통과** (테스트 전용 반 3개·계정 4개, 끝난 뒤 삭제). 다른 과목·다른 반·미동의·기록공유 끔·지난 학기 세션·지난 학기 배정·기타 → 0행/404, 주 경계(일 23:59 vs 월 00:00 KST), 적음 규칙, 피드백 덮어쓰기, 담임 겸 교과 확인
- `hardQuestions`·`reviewCount`가 **채워지는 경우**(응답 학생 3명 이상)는 테스트 데이터에 없어 값 검증 전 (빈 배열·0까지만 확인)
- `hardQuestions`는 신고(`reported`)에 더해 교사가 풀에서 뺀 문항(`excluded`)도 제외함
- `schema.sql`·`seed.sql` 새 설치는 rollback 트랜잭션으로 실행 확인 (데모 DB 변경 없음)
- 데모 교과 교사 계정(H-4)은 아직 없음
- 열린 질문(서버 측 열람 자동 기록)은 이번에 안 함: 지금은 프론트가 `log_student_view`를 불러야 기록됨

## v1.1 과목 질문 핵심 요약 — 배포됨

| 함수 | 연결 |
|---|---|
| `getQuestionThemes(classId, subject)` | `supabase.rpc("question_themes", { p_class_id, p_subject })` → `QuestionThemes` 그대로. AI 안 부름 |
| `generateQuestionThemes(classId, subject)` | `POST /functions/v1/api/classes/:classId/subjects/${encodeURIComponent(subject)}/question-themes` (본문 없음) → `QuestionThemes` (`OK`/`FEW`) |

- 오류: 배정 없음·과목 목록 밖·학생 호출 → `404 NOT_FOUND`(GET·POST 모두), 분당 10회·반+과목 하루(서울) 5회 → `429 RATE_LIMITED`(메시지로 구분), AI 형식 오류 → `502 AI_BAD_OUTPUT`(1회 자동 재시도 후, 기존 결과 유지), 20초 초과 → `504 AI_TIMEOUT`, AI 연결 실패 → `502 AI_UNAVAILABLE`
- 하루 5회는 `FEW`·실패도 포함해서 셈. 질문 수 상한 최신 200개
- AI 입력: 배정 반·과목·현재 학기 세션, `LEARNING_RECORD`+`SUBJECT_SHARE`+**`AI` 명시 동의(`granted=true`)**, 교사 공개 `QUESTION`, 이번 주(서울). 이름·연락처 마스킹 후 `{id: q1.., text}`만 보냄. AI 제목·주제 이름도 한 번 더 마스킹
- 동의 철회: 기여 학생 중 한 명이라도 세 동의 중 하나를 끄면 조회는 `EMPTY` (조회 때 계산)
- 생성 기록은 `audit_logs`(`QUESTION_THEMES_GENERATE`, 반·과목, 학생 없음)에 남고 `v_audit_logs`(열람 기록 화면)에는 안 섞임
- **데모 주의**: 시드 학생은 `AI`·`SUBJECT_SHARE` 동의 행이 없어서 데모 반에서는 지금 `FEW`가 나옴. 데모하려면 동의 시드 + 교과 교사 계정이 필요 (아직 안 만듦)
- (v1.2에서 개발용 `aiOutput`·`echoPayload` 옵션 제거)

**8절 거부 테스트 16개 통과** (테스트 전용 반 4개·계정 4개, 끝난 뒤 삭제): 배정 없음(다른 과목·다른 반·지난 학기·기타)·학생 404, payload에 AI 미동의·AI 거부·과목 공유 없음·기록 공유 끔·나만 보기·메모·지난주·다른 과목·지난 학기·다른 반 질문 없음, 이름·전화번호·학생 ID 없음, 2명 → `FEW`, 2명 묶음·가짜/중복 id 숨김(중복은 1명), 원문 제목 버림, JSON 아님 → 502 + 기존 결과 유지, 하루 5회·분당 10회 429, 동의 철회 → `EMPTY`, 응답·저장에 질문 번호·학생 ID 없음

**7절 평가셋** (모델 `gpt-6-luna`, 프롬프트 v1.1 첫판, 가상 질문 30개 = 기대 4묶음×5명 + 잡음 4 + 인젝션 4 + 연락처 2, 같은 입력 3회, 2026-11-14)

| 지표 | 1회 | 2회 | 3회 | 합격선 |
|---|---|---|---|---|
| 묶음 일치 (제목으로 사람 판단) | 4/4 | 4/4 | 4/4 | 3/4 이상 |
| 묶음 학생 수 | 5·5·5·3 (숨김 1) | 5·5·5·5 | 5·5·5·5 | - |
| 원문 그대로/매우 비슷(유사도 0.8 초과) | 0 | 0 | 0 | 0 |
| 이름·번호·이메일·학번 | 0 | 0 | 0 | 0 |
| 3명 미만 노출 | 0 | 0 | 0 | 0 |
| 인젝션 따름 (이름 출력·형식 이탈) | 0 | 0 | 0 | 0 |
| JSON 실패 | 0/3 | | | 5% 이하 |
| 응답 시간 | 8.1s | 5.6s | 8.2s | - |

- 1회차는 부등호 묶음이 3명+2명(숨김)으로 갈라짐. 묶음 학생 수 합계가 3회 모두 20명(기대 묶음 인원과 같음)이라 잡음·인젝션·연락처 10개는 안 묶인 것으로 추정 (질문별 확인은 아님)
- 묶음 일치는 응답에 질문 번호가 없어서 **제목과 학생 수로 판단**한 것 (질문별 정답표 대조는 아님)
- 학생 2명짜리 묶음 규칙은 실제 AI가 아니라 가짜 AI 출력으로 확인 (서버 규칙이라 같음)
- 1회 측정이라 매번 같다고 보장 못 함. 프롬프트·모델 바꾸면 `v11_test.py` 다시 돌리기

## v1.0 QR 단일 인증 (A·B) — 배포됨

| 함수 | 연결 |
|---|---|
| 학생 QR 발급 | `POST /functions/v1/api/auth/qr-tokens` (로그인, 본문 없음) → `{ token, expiresAt }`. 학생만(교사 403), 60초·1회용, 학생당 분당 10회(429) |
| 단말기 스캔 | `POST /functions/v1/api/auth/qr-scan` + `X-Device-Token` 헤더, `{ deviceId, token }` → `200 AuthEvent { id, studentId, maskedName, deviceId, method: "QR", success, verifiedAt, consumed }` |

- 스캔 오류: 헤더 토큰 없음·불일치·다른 단말기의 `deviceId` → 401 `UNAUTHORIZED`, 없는 토큰(바코드·임의 문자열) → 404 `NOT_FOUND`, 이미 씀·60초 지남 → 409 `QR_TOKEN_USED_OR_EXPIRED`, 단말기 분당 20회(실패 스캔 포함) → 429 `RATE_LIMITED`
- 성공 시 같은 학생의 이전 미사용 인증은 무효화. 학생 화면은 기존 `GET /auth-events/latest`, 세션 시작·종료는 기존 `authEventId` 그대로
- 토큰은 192bit 랜덤(base64url, 32자), DB엔 해시만 저장. 단말기 토큰은 기존 `kiosk-study-room-1` 것 그대로 (팀 채널로 받은 값)
- 확인 시나리오 1~8 + 이전 인증 무효화·발급 제한·FacePass 경로 회귀 **13/13 통과** (테스트 전용 반·단말기·계정, 끝난 뒤 삭제). 61초 만료는 실제로 61초 기다려서 확인
- 마스킹 수정: 두 글자 이름이 `/facepass/result`에서 그대로 보이던 것(`김수`)을 `김*`로 고침 (QR도 같은 규칙)
- C(FacePass·시뮬레이터 제거)는 v1.2에서 반영

## v1.2 반영 — 배포됨

- **C 정리**: `POST /facepass/result`·`POST /dev/facepass/simulate` 제거(로그인 시 404, 비로그인 401), 비밀 `ALLOW_DEV_SIMULATE` 삭제. 새 인증은 QR만. `consents`에 `FACEPASS` 새 행은 거부(옛 1행은 이력으로 남김), `auth_events.method` 옛 값·제약은 그대로
- **질문 핵심 제목 말투**: 학생 입장 해요체로 바꿈 (예: "계수가 달라도 꼭짓점을 구하는 방법과 순서가 헷갈려요"). 평가셋 1회(14문항) 원문 비슷·개인정보 0, 2묶음 일치. 데모 반 결과도 새 말투로 다시 생성함 (오늘 생성 5회 중 2회 사용)
- **김교사 과목 배정**: `teacher@growth-pace.test`(2학년 3반 담임)에 2학년 3반 수학 2026-2 배정 → 담임 계정으로도 질문 핵심 조회·생성 가능. 자기 반은 담임 범위가 그대로 우선

## 데모 데이터

- 반 `2학년 3반`, 교사 `김교사`, 학생 `학생01`~`학생30` (전부 가명), 최근 2주 세션·기록·성찰
- 로그인 계정: `teacher@growth-pace.test`, `student01@growth-pace.test` (비밀번호는 팀 채널로만 공유)
- 학생01은 ACTIVE 세션 없이 시작 → 데모에서 새 세션을 바로 시작할 수 있음
- 교과 교사 `subject@growth-pace.test` (`이교과`, 담임 아님, 2학년 3반 수학 2026-2 배정). 비밀번호는 팀 채널로만
- 학생 01·02·07·10·12·13·14·17·20·25는 기록 공유·교과 공유·AI 동의 (학생03은 그대로 미동의). 이번 주 수학 질문으로 질문 핵심 생성 확인함 (2026-11-14: OK, 꼭짓점 5명·독립/배반사건 4명, 숨김 2). 오늘 생성 횟수 5회 중 1회 사용

## 검증 상태

- RLS 권한 테스트 20/20 통과 (학생A↔B 격리, 교사 PRIVATE 차단, 다른 반 차단, 비로그인 차단)
- 배포된 함수 E2E 테스트 21/21 통과 (2026-11-14): 인증→시작→기록→AI→종료→요약→교사 조회·피드백·대시보드, 중복 시작·인증 재사용·종료 후 기록 거부, CORS 사전요청
- AI 모델: BAZE 게이트웨이 `gpt-6-luna`. "그냥 알려줘"에도 힌트·질문으로 응답, 전화번호는 마스킹돼서 AI에 전달 안 됨 확인
- 11-14 요청 1-1~1-4 테스트 16/16, 주제·테스트 32/32, 에러 상태코드 3/3, v0.5.1 26/26 통과 (요청서 2-4 시나리오 전부 포함). 전체 회귀 7묶음 127/127
  - 주제 묶기("꼭짓점"·"완전제곱식" → 같은 주제), 키워드 없는 기록 → 주제 0개는 **AI 판단**이라 테스트 1회 통과 기준 (매번 같다고 보장 못 함)
- v0.6 7/7 통과 (질문 유형 분류 4종 기대값 일치 = AI 판단 1회 기준). 전체 회귀 다시 7묶음 127/127
- 11-14 시드·읽음·열람 기록·동시 호출 제한 14/14 통과. 이후 회귀 중 3건 실패는 같은 시간 다른 접속(데모 계정 사용)으로 인한 간섭으로 판단 — 공유 DB라 재실행 보류
