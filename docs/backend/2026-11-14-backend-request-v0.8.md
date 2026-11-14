# 백엔드 요청 v0.8 (프론트 → 백엔드, 2026-11-14)

이 문서 하나만 읽어도 되도록 썼다. 배경 계획: `docs/plans/2026-11-14-pace-ocr-plan.md`.

새 기능 세 가지 중 **Pace 성장 그래프는 백엔드 변경이 없다**(기존 view로 프론트가 계산). 백엔드가 할 일은 종이 기록 사진 OCR과 휴대폰 동시 로그인 확인이다.

## 0. 한눈에

| # | 우선 | 요청 | 종류 |
|---|---|---|---|
| A | 높음 | `POST /sessions/:id/ocr` — 종이 기록 사진에서 글자 읽기 | 새 함수 |
| B | 높음 | 같은 학생 계정으로 PC + 휴대폰 동시 로그인 허용 확인 | 확인 |
| C | 중간 | Pace 계산에 쓰는 view 읽기 권한 확인 (교사·학생) | 확인 |
| D | 선택 | `entries` Realtime 구독 허용 (휴대폰에서 올린 기록이 PC에 바로 보이게) | 설정 |

---

## A. 종이 기록 사진 OCR (높음)

**흐름**: 학생이 학습 중 '종이에 기록' 탭에서 사진을 찍음 → 프론트가 긴 변 1600px JPEG로 줄여 보냄 → 서버가 AI(비전)로 글자를 읽어 돌려줌 → 학생이 확인·수정 → 기존 방식대로 `entries`에 `kind='PAPER'`로 저장(프론트가 저장. OCR 함수는 저장하지 않음).

**요청**
```
POST /functions/v1/api/sessions/:id/ocr
Authorization: Bearer <access token>
Content-Type: application/json

{ "image": "data:image/jpeg;base64,..." }
```

**응답**
```json
{ "text": "꼭짓점 공식 x = -b/2a\n완전제곱식으로 바꾸면 꼭짓점이 보인다" }
```

**규칙**
| 항목 | 내용 |
|---|---|
| 권한 | 학생 본인 세션만. 아니면 `404 NOT_FOUND` |
| 세션 상태 | `ACTIVE`만. 아니면 `409 SESSION_NOT_ACTIVE` |
| 동의 | 최신 `AI` 동의가 `granted=false`면 `403 CONSENT_REQUIRED` (4-1과 같은 규칙) |
| 크기·형식 | `data:image/jpeg` 또는 `data:image/png`, 디코딩 후 2MB 이하. 아니면 `400 VALIDATION` |
| 호출 제한 | 기존 분당 10회·하루 200회에 포함 (`429 RATE_LIMITED`) |
| AI 지시 | "사진 속 손글씨·인쇄 글자를 줄 단위로 그대로 옮긴다. 요약·해석·풀이하지 않는다. 읽을 수 없는 부분은 [?]로 둔다. 마크다운 금지." |
| 출력 검증 | 문자열, 2000자 이하(넘으면 자름), 빈 결과면 `{ "text": "" }` |
| 개인정보 | 결과 글자에 기존 마스킹(이름·연락처 → `[이름]`·`[연락처]`) 적용. **사진은 저장하지 않고, 로그에도 남기지 않음**(요청 본문 로깅 끄기) |
| 실패 | 시간 초과 `504 AI_TIMEOUT`, 형식 오류 `502 AI_BAD_OUTPUT` (메시지는 기존 형식) |

**확인 시나리오**
1. 손글씨 메모 사진 → 줄 단위 텍스트, 200
2. AI 동의 철회 학생 → 403 `CONSENT_REQUIRED`
3. 종료된 세션 → 409 `SESSION_NOT_ACTIVE`
4. 다른 학생 세션 → 404
5. 3MB 이미지 → 400 `VALIDATION`
6. 전화번호가 적힌 사진 → 결과에 `[연락처]`
7. 함수 로그에 이미지 base64가 남지 않음

---

## B. 휴대폰 동시 로그인 (높음)

PC에서 학습 중인 학생이 **같은 계정으로 휴대폰에도 로그인**해 종이를 찍어 올리는 흐름이다. 프론트는:
- 로그아웃을 `signOut({ scope: "local" })`로 해서 한 기기 로그아웃이 다른 기기를 끊지 않음.
- PC 화면에 QR(이 학습 화면 주소 `/student/session/:id?kind=PAPER`)을 보여 줌. QR에 토큰·비밀번호는 넣지 않음. 휴대폰은 일반 로그인 후 그 화면으로 감.

확인 부탁:
1. Supabase Auth에서 **사용자당 단일 세션 제한(single session per user)** 이 꺼져 있는지. 켜져 있으면 휴대폰 로그인 때 PC가 끊김.
2. 휴대폰 브라우저(Safari·Chrome)에서 함수 호출 CORS가 통과하는지(배포 주소가 정해지면 그 출처도).
3. 같은 학생이 두 기기에서 같은 세션에 `entries`를 insert해도 문제없는지(현재 RLS는 본인·ACTIVE 세션이면 허용으로 알고 있음).

---

## C. Pace 계산용 읽기 권한 확인 (중간)

Pace 지수(하루 100점: 학습 지속성 25 · 과정 기록 25 · 자기 성찰 20 · 목표 달성 30)는 **프론트가 기존 view로 계산**한다. 서버 변경 없음.

| view | 쓰는 컬럼 | 학생 본인 | 교사(자기 반, 기록 공유 동의 학생) |
|---|---|---|---|
| `v_sessions` | id, studentId, startedAt, durationMinutes, status | 읽기 | 읽기 |
| `v_entries` | sessionId, kind, content, visibility, createdAt | 읽기 (점수에는 TEACHER·PAPER만 씀) | TEACHER만 (지금과 같음) |
| `v_reflections` | sessionId, checks, understanding, remainingQuestions, note | 읽기 | 읽기 (미동의면 0건) |
| `v_quiz_attempts` | sessionId, correct, total, createdAt | 읽기 | 읽기 (미동의면 0건) |

확인 부탁: 교사가 위 view를 `.eq("studentId", ...)` 또는 `.in("sessionId", ids)`로 읽을 수 있는지, 미동의 학생은 지금처럼 0건인지. 점수에는 '나만 보기' 메모를 넣지 않기로 했다(사용자 결정) — 교사와 학생이 같은 점수를 보고, 비공개 메모 개수도 교사에게 드러나지 않게.

---

## D. Realtime (선택)

휴대폰에서 올린 종이 기록이 PC 학습 화면에 바로 보이게 `entries` 테이블 Realtime(postgres_changes, RLS 적용)을 켜 줄 수 있으면 프론트가 구독한다. 안 되면 프론트는 5초마다 다시 불러온다.

---

질문이나 다르게 하고 싶은 부분은 프론트에 알려 주세요.
