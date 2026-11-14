# 성장 페이스 — 프론트엔드

AI와 함께 스스로 공부한 과정을 기록하고, 교사와 함께 돌아보는 자기주도학습 플랫폼 (2026 INHA AX-EDU 해커톤).

## 실행

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # mock API 규칙·개인정보 함수 테스트
npm run build
```

환경 변수는 `.env.example`을 복사해 `.env.local`로 만든다. **프론트에는 공개 가능한 값만** 둔다 (`service_role`, LLM 키 금지).

| 변수 | 설명 |
|---|---|
| `VITE_USE_MOCK` | **`true`일 때만** 브라우저 안 mock API, 그 밖(없음 포함)은 실제 Supabase. 데모는 `npm run dev:demo`(5174) |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Supabase 공개 값 |
| `VITE_KIOSK_DEVICE_ID` | 키오스크 기기 ID |
| `VITE_THEME` | 화면 테마. `pink`면 분홍 테마, 없거나 다른 값이면 기본(초록). 기능은 같고 `styles/theme-pink.css`만 켜진다 |

테마는 빌드 없이 주소로도 바꿔 볼 수 있다: `?skin=pink` / `?skin=default` (그 탭에서 유지, 탭을 닫으면 빌드 값으로 돌아감).

## 데모 흐름

1. `/` 에서 학생(예: 1번) 선택 → 학습 시작 → 과목·활동 체크 → "단말기 얼굴 인증 흉내" (또는 다른 탭 `/kiosk`에서 인증)
2. 메모·궁금한 점·종이에 기록 남기기, AI 도우미에 질문 (개념은 바로 설명, "정답 알려줘"에는 마지막 계산을 학생에게 맡김)
3. 학습 끝내기 → 종료 인증 → (단원을 골랐으면) **단원 테스트** → 결과·해설 → 기록 근거 요약 + 체크리스트 돌아보기
4. 로그아웃 → 한담임 선생님 → 학생 선택 → **종합 보드**(단원별 시간·기록·테스트·이해도, 차이 신호) → AI 채점안 받기 → 근거 보기 → 판단 수정·확정, 피드백
5. 교사 메뉴 **단원 문제** → AI 초안 만들기(근거 표시) → 수정 → 승인 → 학생에게 출제

단원 테스트 데모: 수학 '경우의 수'는 승인 문제 0개(빈 퀴즈), 과학 '물질의 상태 변화'는 성취기준 없음(AI 초안 불가), 9번 학생은 "이해했다는데 점수 낮음" 신호.

데모 계정: 3번 = 얼굴 인증 거부(QR 사용), 4번 = AI 거부, 7·15번 = 최근 기록 없음, 12번 = 종이 기록 위주, 30번 = 만 14세 미만(보호자 동의).
QR은 학생 인증 화면의 "단말기에 보여줄 QR 만들기"로 1회용 토큰(60초)을 만들어 키오스크 입력창에 넣는다.

## 구조

```
src/
  types/domain.ts       백엔드와 공유하는 타입 (docs/api-spec.md 와 동일)
  api/types.ts          Api 인터페이스, 에러 코드·문구
  api/mockApi.ts        규칙을 흉내 낸 mock (권한·재사용 방지·동의·마스킹)
  api/mockData.ts       가짜 시드 데이터
  facepass/provider.ts  토스플레이스 FacePass SDK 어댑터 + 데모용 mock
  lib/                  개인정보 마스킹, 체크리스트 항목, 시간 포맷
  features/             kiosk, consent, session, records, teacher, login
```

백엔드 연결: `src/api/index.ts`의 `createNotReadyApi()` 자리에 Supabase 구현을 함수 단위로 넣는다.
