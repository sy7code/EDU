# 성장 페이스

## 프로젝트 소개
**성장 페이스**는 학생이 스스로 공부한 과정을 기록하고 돌아보는 자기주도학습 도구입니다.
학생이 남긴 기록·질문·확인 테스트 결과가 담임과 교과 선생님 화면으로 바로 이어져, 선생님은 학생들이 **어떤 문제에서 막히는지**를 한눈에 보고 피드백할 수 있습니다.
점수보다 과정과 질문을 소중히 여기고, 학생이 공개 범위를 직접 정합니다.

- 팀: 2026 INHA AX-EDU 해커톤 「성장 페이스」
- 구성: `frontend`(웹 앱) + `backend`(Supabase DB·RLS·Edge Function)

## 주요 기능
### 학생
- **학습 시작**: 과목 태그(선택) + 오늘 할 일 입력, 교실 단말기에서 **QR 인증**(60초·1회용)
- **학습 기록**: 메모·궁금한 점·종이 기록(사진 → AI 글자 인식), 기록마다 '교사 공개 / 나만 보기' 선택
- **AI 학습 도우미**: 개념은 설명하고 최종 답은 스스로 찾도록 안내
- **학습 마치기**: AI가 기록에서 주제를 찾고 → 5문항 확인 테스트 → `과목 - 다시 볼 주제` 안내 → 돌아보기
- **성장 보기**: Pace 성장 그래프, 주제별 성장, 선생님 피드백
- **동의 설정**: AI 사용·학습 기록 공개·교과 선생님 공개를 학생이 직접 선택, 내 기록을 본 사람 확인

### 담임 선생님
- **반 대시보드**: 오늘 챙길 학생, 학생별 학습 현황, CSV 내려받기
- **학생 상세**: 학생이 공개한 기록만 보고 피드백 작성(열람 기록이 남음)
- **반 분석·신고된 문제**: 질문 유형 비율, 학생이 신고한 테스트 문항 처리(AI 1차 검토)

### 교과 선생님
- **맡은 과목**: 과목 → 반 탭 → 학생, 그 과목 기록만 열람
- **주간 집계**: 주제별 '다시 볼 후보', **많이 틀린 문항**
- **이번 주 질문 핵심**: 학생 질문의 공통 핵심을 AI가 묶어 요약(이름·원문 비공개, 3명 미만 묶음 숨김)

### 개인정보 보호
- 공개 범위와 동의는 서버 RLS로 강제, 소수 인원 집계는 '적음'으로 가림
- AI로 보내기 전 서버에서 이름·연락처를 가리고, 종이 사진은 저장하지 않음
- 단말기 토큰·비밀 키는 코드에 넣지 않음

## 기술 스택
- Frontend: React 19, TypeScript 5.8, Vite 6, React Router 7, TanStack Query 5, Tailwind CSS 4
- Backend: Supabase(PostgreSQL + RLS, Edge Functions), supabase-js 2.119
- AI: OpenAI 호환 게이트웨이(BAZE) `gpt-6-luna` — Edge Function에서만 호출, 키는 서버 비밀 저장소

## 실행 방법
### 1. 데모 모드 (백엔드 없이 바로 실행)
가짜 데이터로 모든 화면을 볼 수 있습니다. 로그인 화면에서 데모 계정을 골라 들어갑니다.
```bash
cd frontend
npm ci
npm run dev:demo
```

### 2. 실제 모드 (Supabase 백엔드)
실제 DB·AI와 연결해 실행합니다. 키·비밀번호는 저장소에 넣지 않습니다.

**① Supabase 준비**
1. [Supabase](https://supabase.com)에서 새 프로젝트를 만듭니다.
2. Authentication > Users에서 데모 계정을 먼저 만듭니다(비밀번호는 직접 정함).
   - `teacher@growth-pace.test` (담임) · `student01@growth-pace.test` (학생) · `subject@growth-pace.test` (교과 선생님)
3. SQL Editor에서 아래 순서로 실행합니다.
   1. `backend/supabase/schema.sql` — 테이블·RLS·함수 전체 (`migrations/`는 변경 기록이며 모두 포함됨)
   2. `backend/supabase/seed.sql` — 데모 반·학생 30명(가명) 데이터, 위 계정과 자동 연결
4. 교실 단말기 토큰을 등록합니다. 토큰은 직접 정한 임의 문자열이며, DB에는 해시만 저장합니다.
   ```sql
   update devices set token_hash = encode(extensions.digest('<단말기 토큰>', 'sha256'), 'hex')
   where id = 'kiosk-study-room-1';
   ```

**② Edge Function 배포**
```bash
cd backend
npx supabase login
npx supabase functions deploy api --project-ref <프로젝트 ref> --no-verify-jwt
npx supabase secrets set --project-ref <프로젝트 ref> \
  LLM_BASE_URL=<OpenAI 호환 AI 게이트웨이 주소> \
  LLM_API_KEY=<AI 키> \
  LLM_MODEL=gpt-6-luna
```
- AI 키와 service role 키는 Edge Function 비밀 저장소에만 둡니다(프론트·코드에 넣지 않음).

**③ 프론트 연결**
`frontend/.env`(예시: `frontend/.env.example`)에 공개 가능한 값만 넣습니다.
```bash
VITE_USE_MOCK=false
VITE_SUPABASE_URL=https://<프로젝트 ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
VITE_KIOSK_DEVICE_ID=kiosk-study-room-1
```
```bash
cd frontend
npm ci
npm run dev
```

> 백엔드 API 목록·연결 방법·검증 결과는 [`backend/FRONTEND_NOTES.md`](backend/FRONTEND_NOTES.md)에 있습니다.
