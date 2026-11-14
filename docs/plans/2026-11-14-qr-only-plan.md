상태: 승인

# QR 단일 인증 전환 — 설계와 구현 계획 (2026-11-14)

> 에이전트 작업자용: superpowers:subagent-driven-development로 작업 단위 진행. 단계는 체크박스로 추적.

## 설계 (짧은 설계)
- **의도(사용자)**: 학습 시작·종료 인증에서 FacePass(얼굴), 학생증 바코드, 선생님 확인(수기)을 모두 빼고 **QR만** 남긴다.
- **사용자 결정**: QR만 남김(휴대폰 없는 학생은 시작 불가 — 위험 수용). 실제 모드는 백엔드 QR 배포 전까지 **개발용 '인증 건너뛰기'** 버튼만 남기고, QR 배포 후 제거.
- **흐름(지금과 같음)**: 학생 휴대폰(로그인)에서 1회용 QR(60초)을 띄움 → 교실 단말기(`/kiosk`)가 읽음 → 학생 화면이 인증 이벤트를 받아 시작·종료.
- **Claude 기본값**
  1. 학생 휴대폰에 텍스트 토큰 대신 **실제 QR 이미지**를 그린다(이미 쓰는 `qrcode` 1.5.4, 새 의존성 없음). 토큰 글자는 작게 함께 표시(스캐너 없을 때 입력용).
  2. 단말기는 지금처럼 **입력칸**으로 받는다. 시중 USB·블루투스 QR 스캐너는 키보드처럼 글자를 입력하므로 카메라 라이브러리를 새로 넣지 않는다. 입력칸은 자동 포커스, Enter로 제출.
  3. 과거 기록 표시용으로 `AuthMethod` 타입과 라벨(`얼굴 인증`·`바코드`·`교사 확인`)은 **남긴다**. 새 인증은 `QR`만 만든다.
  4. 동의 종류 `FACEPASS`는 화면·타입에서 뺀다. 서버에 남은 옛 FACEPASS 동의 행은 프론트 매퍼에서 무시한다.
  5. mock 저장 키를 올려 옛 데모 데이터(얼굴 동의·바코드)를 초기화한다.
- **비목표**: 카메라로 QR 읽기, 휴대폰 없는 학생 대체 수단, 백엔드 구현(요청서로 전달).
- **반목표**: 실제 모드에서 학습을 아예 시작할 수 없게 됨(건너뛰기 버튼으로 방지). 과거 학습 기록의 인증 표시가 깨짐.

## 완료 기준 (실행으로 확인)
- `npx vitest run` 전부 통과(얼굴·바코드·수기 테스트를 QR 기반으로 교체), `npx tsc -b --noEmit`, `npx vite build` 통과.
- `rg -n "FACEPASS|FacePass|submitFaceAuth|simulateFaceAuth|submitManualAuth|BARCODE" frontend/src` 결과가 과거 기록 라벨·타입·실제 모드 건너뛰기 주석 외에는 없음.
- mock 화면: 학생 휴대폰 QR 이미지 표시 → `/kiosk` 입력 → 학습 시작·종료, 동의 화면에 얼굴 항목 없음, 반 대시보드에 '선생님이 확인' 열 없음, 375px 넘침 없음.
- 백엔드 요청서 `docs/backend/2026-11-14-backend-request-v1.0-qr.md` 작성.

## 전체 제약
- TDD는 동작 하나씩: 테스트 하나 → 실패 확인 → 구현 → 통과. 보고에 동작마다 `RED: <테스트 이름> → <실패 메시지 한 줄>`을 쓴다. import·컴파일 오류나 없는 이름으로 난 실패는 RED가 아니다. stub을 먼저 두고 기대값 불일치로 실패하는 것을 본다.
- 리뷰 지적·버그를 고칠 때는 같은 원인·패턴의 문제를 같은 모듈과 같은 입력 경로에서 찾아 함께 고친다. 보고에 `같은 종류 검색: <검색어·확인한 경로> → 찾음 N, 고침 M, 남김(이유)`을 쓴다.
- `.env` 등 비밀 파일 읽지 않기. `import.meta.env`가 든 파일은 Edit로만.
- 새 CSS 클래스 접두사 `qr-`. 새 의존성 없음.

---

### Task 1: API·mock·타입 — QR 단일 인증
**파일**: `types/domain.ts`, `api/types.ts`, `api/mockApi.ts`, `api/mockData.ts`, `api/supabaseApi.ts`, `api/supabaseMappers.ts`, `api/index.ts`, `lib/consentSave.ts`, 관련 `*.test.ts`, 삭제 `facepass/provider.ts`·`facepass/provider.test.ts`.
- `ConsentKind`에서 `"FACEPASS"` 제거. `supabaseMappers`의 동의 변환은 알 수 없는 kind를 버린다(테스트: `옛 FACEPASS 동의 행은 무시한다`).
- `Api`: `submitFaceAuth`·`simulateFaceAuth`·`submitManualAuth` 삭제. `submitCodeAuth(deviceId: string, token: string)`(QR만). 새 `devSkipAuth(): Promise<AuthEvent>` — 실제 모드 개발용, supabase는 기존 `/dev/facepass/simulate` 호출, mock은 `throw new ApiError("FORBIDDEN")`(mock은 QR 흉내 사용).
- `FEATURES.manualAuth` 삭제, `codeAuth` 유지(mock만 true).
- mock: `facepassLinks`·`barcodes`·수기 인증 제거, 시드 세션 `startAuth/endAuth = "QR"`, 동의 시드에서 FACEPASS 제거, 저장 키 버전 올림. QR 토큰 60초·1회용·시도 제한은 그대로.
- 테스트 헬퍼 `authByQr(studentId)`(토큰 발급 → submitCodeAuth)로 기존 얼굴 흉내 호출을 일괄 교체. 새 테스트: `바코드 형식 토큰은 거부한다`, `만료된 QR은 거부한다`(있으면 유지).
- [ ] RED/GREEN 기록, 전체 테스트·tsc 통과, 커밋 `feat: QR 단일 인증 — API·mock·타입`

### Task 2: 화면
**파일**: `features/session/AuthWait.tsx`, `features/kiosk/KioskPage.tsx`, `features/login/LoginPage.tsx`, `features/consent/ConsentPage.tsx`, `features/help/HelpPage.tsx`, `features/teacher/ClassDashboard.tsx`, `components/ui.tsx`, 새 `components/QrImage.tsx`(또는 기존 QR 컴포넌트 재사용 — `qrcode` 쓰는 곳 확인), CSS `qr-`.
- AuthWait: 안내 "휴대폰에 QR을 띄워 교실 단말기에 보여 주세요". `FEATURES.codeAuth`면 QR 만들기 → QR 이미지 + 토큰 글자 + 남은 시간. 데모(mock)는 'QR 스캔 흉내' 버튼 유지. 실제 모드(`!FEATURES.codeAuth`)는 "인증 건너뛰기(개발용)" 버튼 → `devSkipAuth`.
- Kiosk: 얼굴 흐름 삭제, "학생 휴대폰의 QR을 스캐너로 읽거나 아래 글자를 입력하세요", 입력칸 자동 포커스·Enter 제출, 결과 문구.
- LoginPage: "QR로 학습 시작" 문구, 데모 힌트에서 얼굴 관련 줄 제거. ConsentPage: FACEPASS 항목·ICON·초기값 제거. HelpPage: 얼굴 문구 제거. ClassDashboard: 선생님 확인 열·버튼·설명 제거.
- `METHOD_LABEL`은 과거 기록용으로 유지.
- [ ] tsc·build 통과, 커밋 `feat: QR 단일 인증 — 화면`

### Task 3: 문서
- `docs/backend/2026-11-14-backend-request-v1.0-qr.md`: `POST /auth/qr-tokens`(학생, 60초, 1회용) / `POST /auth/qr-scan`(단말기 ID, 토큰, 시도 제한) → `auth_events` 기록, 기존 `/auth-events/latest` 재사용, FACEPASS 관련 엔드포인트·`/dev/facepass/simulate`는 QR 배포 후 제거, 프론트 플래그 `codeAuth` 켜는 조건.
- `docs/api-spec.md`, `docs/decisions.md`(Claude 기본값 1~5 + 사용자 결정), `docs/00-review.md` 위험(휴대폰 없는 학생), `docs/PROJECT_LOG.md`.
- [ ] 커밋 `docs: QR 단일 인증 전환`
