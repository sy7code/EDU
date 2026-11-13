# 성장 페이스 — 프론트엔드 구현 계획

> 해커톤용으로 줄인 계획. 원칙: **API 계약(타입)을 먼저 정하고, 프론트는 mock으로 끝까지 돌린 뒤 실제 백엔드로 교체.**
> 페이스패스·슈퍼스쿨 실제 API는 2일차 공개 → 어댑터 뒤에 숨긴다.

## 완료 기준

- 학생 흐름(인증 → 목표 → 학습 기록·AI 논의 → 종료 인증 → 요약·성찰)이 mock 데이터로 끊김 없이 동작한다.
- 교사 화면에서 학생 세션 타임라인을 보고 피드백을 저장할 수 있다.
- `VITE_USE_MOCK=false`로 바꾸면 같은 화면이 Supabase 데이터로 동작한다(백엔드 준비분만큼).
- Cloudflare Pages 배포 URL에서 데모 시나리오 전체가 재생된다.

## 1. 기술 스택

| 영역 | 선택 | 이유 |
|---|---|---|
| 빌드 | Vite + React + TypeScript | 빠른 셋업, Cloudflare Pages 정적 배포 |
| UI | Tailwind CSS + shadcn/ui | 시간 절약, 일관된 디자인 |
| 라우팅 | React Router | 학생·교사·키오스크 화면 분리 |
| 서버 상태 | TanStack Query | mock ↔ 실제 API 교체해도 화면 코드 동일 |
| 백엔드 클라이언트 | `@supabase/supabase-js` | Auth, DB, Realtime |
| 배포 | Cloudflare Pages | 노트에 적힌 인프라 |

LLM 호출과 페이스패스 webhook은 **반드시 서버 쪽**(Supabase Edge Function 또는 Cloudflare Pages Functions)에서 처리한다. API 키를 프론트에 두지 않는다.

## 2. 화면 목록

### 키오스크(교실·자습실 태블릿)
- **K1 인증 화면**: "얼굴을 비춰 주세요" → 인증 중 → 성공(이름, 시작/종료 시각) / 실패(재시도, QR 대체)

### 학생
- **S1 홈**: 오늘 세션 시작 버튼, 최근 기록 요약
- **S2 학습 시작**: K1 인증 결과 수신 → 오늘의 학습 목표 입력
- **S3 학습 세션**(핵심): 경과 시간, 목표 고정 표시, 기록 입력(메모 / 질문), AI 논의 패널, 짧은 테스트(선택)
- **S4 학습 종료**: 종료 인증 → 요약 카드(시작·종료 시각, 세션 시간, 주요 활동, 남은 질문) → 성찰 입력(무엇이 달라졌나, 남은 궁금증)
- **S5 내 기록**: 세션 타임라인, 교사 피드백 확인

### 교사
- **T1 반 대시보드**: 학생 목록, 이번 주 세션 수·시간, 남은 질문이 쌓인 학생 표시(점수 아님)
- **T2 학생 상세**: 세션별 타임라인(목표 → 기록 → AI 논의 → 성찰), 피드백 작성
- **T3 리포트**: 멘토에게 받은 현장 양식에 맞춘 출력(양식 확보 후 구현)

## 3. API 계약 (백엔드와 먼저 합의할 것)

`src/types/domain.ts`에 두고 백엔드와 공유한다. DB 테이블도 이 구조를 따른다.

```ts
export type AuthMethod = "FACEPASS" | "QR" | "MANUAL";

export type Student = { id: string; name: string; classId: string; number: number };

export type LearningSession = {
  id: string;
  studentId: string;
  goal: string;
  startedAt: string;          // ISO
  endedAt: string | null;
  startAuth: AuthMethod;
  endAuth: AuthMethod | null;
  status: "ACTIVE" | "ENDED";
};

export type LearningEntry = {
  id: string;
  sessionId: string;
  kind: "MEMO" | "QUESTION" | "QUIZ";   // AI 대화는 AiMessage로 분리 (docs/api-spec.md 기준)
  content: string;
  createdAt: string;
};

export type AiMessage = {
  id: string;
  sessionId: string;
  role: "student" | "ai";
  content: string;
  createdAt: string;
};

export type Reflection = {
  sessionId: string;
  changed: string;            // 무엇이 달라졌나
  remainingQuestions: string[];
};

export type Feedback = {
  id: string;
  sessionId: string;
  teacherId: string;
  content: string;
  createdAt: string;
};

export type FaceAuthResult = {
  studentId: string;
  method: AuthMethod;
  verifiedAt: string;
  deviceId: string;
  success: boolean;
};
```

### 프론트가 부르는 함수 (`src/api/index.ts`)

```ts
export interface Api {
  // 인증 (페이스패스 어댑터)
  waitForFaceAuth(deviceId: string): Promise<FaceAuthResult>;

  // 세션
  startSession(input: { studentId: string; goal: string; auth: AuthMethod }): Promise<LearningSession>;
  endSession(sessionId: string, auth: AuthMethod): Promise<LearningSession>;
  getSession(sessionId: string): Promise<LearningSession>;
  listSessions(filter: { studentId?: string; classId?: string }): Promise<LearningSession[]>;

  // 기록
  addEntry(input: Omit<LearningEntry, "id" | "createdAt">): Promise<LearningEntry>;
  listEntries(sessionId: string): Promise<LearningEntry[]>;

  // AI (서버 함수 경유)
  askAi(sessionId: string, message: string): Promise<AiMessage>;
  summarizeSession(sessionId: string): Promise<{ activities: string[]; remainingQuestions: string[] }>;

  // 성찰·피드백
  saveReflection(r: Reflection): Promise<void>;
  addFeedback(input: Omit<Feedback, "id" | "createdAt">): Promise<Feedback>;

  // 학교 데이터 (슈퍼스쿨 어댑터)
  listStudents(classId: string): Promise<Student[]>;
}
```

- `mockApi.ts`: 메모리 + `localStorage`, 지연(300ms)과 실패 확률 옵션
- `supabaseApi.ts`: 백엔드 준비분부터 하나씩 교체
- `index.ts`: `import.meta.env.VITE_USE_MOCK`으로 선택

### 백엔드 담당자와 맞출 체크리스트

- [ ] 위 타입 그대로 테이블·컬럼 이름 합의 (snake_case ↔ camelCase 변환 위치 결정)
- [ ] `askAi`, `summarizeSession`을 Edge Function으로 만들지 Pages Function으로 만들지
- [ ] AI 응답을 스트리밍으로 받을지 (데모 체감 큼, 늦으면 일반 응답)
- [ ] 페이스패스 결과를 받는 방식: webhook → DB insert → 프론트는 Realtime 구독 (2일차 확정)
- [ ] 데모 계정·RLS: 해커톤에선 단순화하되 학생은 자기 세션만 보게
- [ ] 시드 데이터: 학생 30명, 2주치 세션·기록

## 4. 폴더 구조

```
src/
  api/          index.ts, mockApi.ts, supabaseApi.ts, mockData.ts
  types/        domain.ts
  features/
    kiosk/      FaceAuthScreen
    session/    SessionPage, EntryInput, AiPanel, SessionSummary, ReflectionForm
    student/    StudentHome, MyTimeline
    teacher/    ClassDashboard, StudentDetail, FeedbackForm
  components/   ui/(shadcn), Timeline, StatCard
  lib/          supabase.ts, format.ts
  routes.tsx
```

## 5. 작업 순서

| 순서 | 작업 | 시간 | 산출물 |
|---|---|---|---|
| P0 | Vite 셋업, Tailwind·shadcn, 라우팅, Cloudflare Pages 첫 배포 | 1h | 빈 앱 배포 URL |
| P1 | `domain.ts`, `Api` 인터페이스, `mockApi`, 시드 데이터 → 백엔드에 공유 | 1h | 계약 확정 |
| P2 | K1 인증 화면(mock: 버튼 누르면 1초 뒤 성공/실패) | 0.5h | 키오스크 흐름 |
| P3 | S2 → S3 → S4 학생 학습 흐름 | 2.5h | 핵심 데모 |
| P4 | AI 패널(mock 응답, 이후 실제 함수 연결) | 1h | AI 논의 |
| P5 | T1, T2 교사 화면 + 피드백 | 2h | 교사 데모 |
| P6 | S5 내 기록, 반응형(태블릿) 점검, 빈 상태·에러 상태 | 1h | 마감 품질 |
| 2일차 | 페이스패스·슈퍼스쿨 어댑터 실제 구현으로 교체, T3 리포트 | — | 실제 연동 |

P3·P5가 데모 점수(구체화 수준)에 직접 걸리므로 시간이 모자라면 S5와 T3를 먼저 버린다.

## 6. 화면 상태 체크

모든 데이터 화면에 **로딩 / 빈 상태 / 에러** 세 가지를 둔다. 인증 화면은 추가로 **실패 → 재시도 / QR 대체**를 둔다.

## 7. 프론트 보안·개인정보 (api-spec.md 6장과 짝)

- **비밀키 금지**: 프론트 env에는 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`만. 빌드 후 `dist/`에서 `service_role`, `sk-` 문자열 검색해 0건 확인.
- **XSS**: `dangerouslySetInnerHTML` 사용 금지. AI 응답·학생 기록은 텍스트로 렌더링. 마크다운이 필요하면 `react-markdown` + `rehype-sanitize`.
- **권한은 서버가 판단**: 화면에서 교사 메뉴를 숨기는 건 UX일 뿐. 권한은 RLS·서버 함수가 막는다고 가정하고, 프론트는 `403/404`를 받으면 안내 화면.
- **동의 화면**: 첫 로그인 시 페이스패스 / AI / 기록 공유 동의를 **항목별로** 받음. 만 14세 미만은 "보호자 동의 필요" 안내. 거부해도 QR·기록 기능으로 진행 가능.
- **공개 범위 표시**: 기록 입력란에 "교사 공개 / 나만 보기" 토글. 학생이 "선생님이 보는 화면" 미리보기 가능.
- **AI 패널 안내**: "이름·전화번호 등 개인정보를 입력하지 마세요" 문구 + AI 동의 안 한 학생은 패널 숨김.
- **키오스크**: 이름 마스킹(`김*수`)만 표시, 5초 뒤 대기 화면으로 초기화, 키오스크에는 로그인 세션을 남기지 않음.
- **저장소**: `localStorage`에 학생 개인정보 저장 안 함 (mock은 가명 데이터만). 로그아웃 시 Query 캐시 초기화.
- **보안 헤더**: `public/_headers`에 CSP, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`.
- **에러 화면**: 서버 에러 원문을 그대로 보여주지 않고 코드별 안내 문구로 변환.
- **데모 데이터**: 실제 학생 정보 사용 금지. 화면 캡처·발표 자료도 가명 데이터로.

## 8. 위험

- 백엔드 지연: mock으로 데모가 가능하게 유지, 교체는 함수 단위로.
- 페이스패스가 결과를 어떤 방식으로 주는지 미확인: `waitForFaceAuth` 하나에 가둬 둔다.
- 학생 데이터는 미성년자 개인정보: 시드 데이터는 가명, AI 함수로 보낼 때 이름 제외.
- 테스트: 해커톤 일정상 전체 TDD는 생략하고, mock API와 세션 시간 계산 같은 순수 함수만 단위 테스트한다.
