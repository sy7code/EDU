# 백엔드 요청 v1.0 — QR 단일 인증 (프론트 → 백엔드, 2026-11-14)

이 문서 하나만 읽어도 되도록 썼다. 계획: `docs/plans/` QR 단일 인증 전환 계획(승인), 결정: `docs/decisions.md` 28~34번.

## 0. 한눈에

학습 시작·종료 인증에서 FacePass(얼굴), 학생증 바코드, 교사 수기 확인을 모두 빼고 **QR만** 남겼다. 프론트(mock)는 끝났다. 실제 모드는 아래가 배포될 때까지 **개발용 '인증 건너뛰기'**(`POST /dev/facepass/simulate`)만 쓴다.

| # | 우선 | 요청 | 종류 |
|---|---|---|---|
| A | 높음 | `POST /auth/qr-tokens` — 학생이 1회용 QR 토큰 발급 | 새 함수 |
| B | 높음 | `POST /auth/qr-scan` — 교실 단말기가 토큰을 읽어 인증 이벤트 생성 | 새 함수 |
| C | 중간 | QR 배포 후 `/facepass/result`, `/dev/facepass/simulate` 제거, FACEPASS 동의 종류 미사용 | 정리 |

흐름(지금과 같음): 학생 휴대폰(로그인)이 QR을 띄움 → 교실 단말기(`/kiosk`)가 스캐너로 읽어 `qr-scan` 호출 → `auth_events`에 `method='QR'` 기록 → 학생 화면이 기존 `GET /auth-events/latest`로 받아 학습 시작·종료.

---

## A. QR 토큰 발급 (높음)

```
POST /functions/v1/api/auth/qr-tokens
Authorization: Bearer <access token>
(본문 없음)
```
응답
```json
{ "token": "랜덤 문자열", "expiresAt": "2026-11-14T19:31:00+09:00" }
```

| 항목 | 내용 |
|---|---|
| 권한 | 학생만. 교사·기타는 `403 FORBIDDEN` |
| 토큰 | 랜덤 128bit 이상. 학생 ID로 유추 불가. 학생 본인에게 묶임 |
| 수명 | **60초**, **1회용**(`consumed_at`) |
| 호출 제한 | 학생당 합리적 상한(제안: 분당 10회). 초과 `429 RATE_LIMITED` |
| 기존 규칙 | api-spec v0.3 규칙 5의 `qr_tokens` 표를 그대로 쓰되 `/auth/qr-token` → `/auth/qr-tokens`로 이름만 바뀜 |

## B. QR 스캔 (높음)

```
POST /functions/v1/api/auth/qr-scan
X-Device-Token: <단말기 토큰>
Content-Type: application/json

{ "deviceId": "kiosk-study-room-1", "token": "string" }
```
응답: `AuthEvent { id, studentId, maskedName, deviceId, method: "QR", success, verifiedAt, consumed }` (기존 `/facepass/result` 응답과 같은 모양, 이름은 마스킹)

| 항목 | 내용 |
|---|---|
| 단말기 인증 | 기존 FacePass 단말기 엔드포인트와 같은 `X-Device-Token` 헤더. **토큰 값은 코드·git·문서에 넣지 않는다**(서버 비밀 저장소만). 헤더 토큰이 `deviceId`에 속하지 않으면 `401` |
| 호출 제한 | **단말기당 분당 20회**(프론트 mock과 같음). 초과 `429 RATE_LIMITED` |
| 성공 | `auth_events` insert(`method='QR'`, `success=true`), 토큰 `consumed_at` 기록 |
| 기록 | 같은 학생의 남은 미사용 이벤트 무효화, 2분 이내·1회 사용 규칙은 기존과 동일(api-spec v0.3 규칙 2) |
| 재사용 | 같은 토큰을 다시 읽으면 `409` |

**오류 형식**: `{ "error": { "code": "...", "message": "..." } }`

| HTTP | code | 상황 |
|---|---|---|
| 401 | `UNAUTHORIZED` | `X-Device-Token` 없음·불일치 |
| 404 | `NOT_FOUND` | 없는 토큰(바코드 등 다른 형식 포함) |
| 409 | `QR_TOKEN_USED_OR_EXPIRED` | 이미 썼거나 60초 지남 |
| 429 | `RATE_LIMITED` | 단말기 분당 20회 초과 |

**재사용**: 인증 결과 조회(`GET /auth-events/latest`, 2분·1회용, 학생 본인은 `{}` 본문)와 세션 시작·종료(`POST /sessions`, `/sessions/:id/end`의 `authEventId`)는 **바꾸지 않는다**.

**확인 시나리오**
1. 학생 발급 → 단말기 scan → 200, `method='QR'`, 학생 `latest`가 받음 → 세션 시작
2. 같은 토큰 두 번째 scan → 409
3. 61초 뒤 scan → 409
4. 교사 계정으로 발급 → 403
5. 잘못된 `X-Device-Token` → 401
6. 단말기 1분 21번째 scan → 429
7. 학생 A 토큰으로 학생 B 세션 시작 시도 → `403 AUTH_STUDENT_MISMATCH`(기존)
8. 바코드 번호·임의 문자열 → 404

---

## C. QR 배포 후 정리 (중간)

QR이 배포·확인되면 알려 주세요. 그때 프론트가 `devSkipAuth`('인증 건너뛰기' 버튼)를 지우고 `FEATURES.codeAuth`를 켠다.

1. `POST /facepass/result` 제거(또는 410). 단말기 토큰은 `qr-scan`이 이어받음.
2. `POST /dev/facepass/simulate`와 `ALLOW_DEV_SIMULATE` 제거.
3. `consents.kind`에서 `FACEPASS`는 **새로 받지 않음**. 옛 행은 지우지 말 것(이력). 프론트 매퍼가 옛 FACEPASS 동의 행을 무시한다.
4. `auth_events.method`의 `FACEPASS`·`BARCODE`·`MANUAL` 값과 check 제약은 **남긴다**(과거 학습 기록 표시). 새 이벤트는 `QR`만. `facepass_links` 표는 쓰지 않으면 보관 후 정리는 백엔드 판단.
5. 교사 수기 인증 엔드포인트(`/auth/manual` 류)가 있다면 제거.

## 열린 질문
- **휴대폰 없는 학생**: 시작할 수 없다. 사용자가 위험을 수용했다(대체 수단 없음). 학교가 정책을 바꾸면 다시 논의.
- **스캐너 하드웨어**: 시중 USB·블루투스 QR 스캐너(키보드처럼 글자 입력 + Enter)를 교실 단말기에 연결한다고 가정한다. 카메라로 읽는 방식은 범위 밖. 하드웨어 선정·구매는 미정.
- 발급 호출 제한 수치(분당 10회 제안)는 백엔드가 정해도 된다.
