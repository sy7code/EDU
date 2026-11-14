상태: 승인

# 과목 질문 핵심 요약 — 설계와 구현 계획 (2026-11-14)

> 에이전트 작업자용: superpowers:subagent-driven-development 또는 executing-plans로 작업 단위 진행.

## 설계
- **의도(사용자)**: 교과 교사는 학생 질문을 다 읽을 수 없으니, 그 반·과목의 공통 질문 핵심을 뽑아 보여 준다. 프로토타입이라 완성도 우선 → **서버 AI 묶음 요약(A)** 선택.
- **보는 곳**: 교과 교사 반·과목 화면(`/teacher/subjects/:classId/:subject`)에 카드 "이번 주 질문 핵심". (담임 반 분석 화면 확장은 범위 밖 — Claude 기본값)
- **보여 주는 것**: 묶음 3~5개. 묶음마다 핵심 한 줄(AI가 다시 쓴 문장, 학생 원문 아님) · 질문한 학생 수 · 관련 주제(있으면). 카드 위 "AI 요약 · 참고용 · 만든 시각", "새로 만들기" 버튼.
- **AI에 넣는 것(권한은 AI 전에 거름)**: 이번 주(서울 월~일) 그 반·과목(`sessions.subject`) 학습의 `QUESTION` 기록 중 `visibility = TEACHER`, 학생이 `LEARNING_RECORD` + `SUBJECT_SHARE` + `AI` 동의 모두 있음. 이름·번호 없이, 기존 마스킹(연락처 등)을 거친 글만, 질문마다 번호만 붙여 보냄.
- **AI 출력 처리**: JSON `{ themes: [{ title, questionIds[] , topicName? }] }`만 받음. 학생 수는 **서버가** questionIds로 서로 다른 학생을 세서 정함(AI 숫자 안 믿음). **학생 3명 미만 묶음은 버리고** "적어서 숨긴 묶음 N개"만 알림. 제목 60자 이하, 학생 원문을 그대로 옮기지 않도록 지시. 질문 글 안의 지시는 따르지 않는 데이터로 다룸(프롬프트 인젝션).
- **저장·비용**: 반·과목·주마다 결과 1개 저장. 교사가 "새로 만들기"를 누를 때만 다시 생성(하루 횟수 제한, 기존 분당 10회 제한 포함). 질문 학생이 3명 미만이면 AI를 부르지 않고 "질문한 학생이 적어 요약하지 않았어요".
- **평가(백엔드에 요청)**: 시드 질문 30개로 기대 묶음을 만든 평가셋, 지표 = 묶음 일치(사람 판정), 원문 그대로 옮김 0건, 이름·번호 포함 0건, 3명 미만 묶음 노출 0건. 프롬프트·모델을 바꿀 때마다 다시 잼.
- **mock**: 규칙으로 흉내 — 질문이 달린 세션의 주제로 묶고(주제 없으면 "기타 질문"), 묶음 제목은 주제 이름 + 질문 유형(개념/확인/답 요청)을 바탕으로 한 템플릿 문장. 같은 3명 규칙·최대 5개를 순수 함수로 공유.
- **비목표**: 담임 화면, 알림, 질문 원문 보기, 학생 개인별 표시.

## 완료 기준 (실행으로 확인)
- `npx vitest run` 통과(새 순수 함수: 3명 미만 묶음 제거·학생 수 서버 계산·최대 5개·정렬, mock 입력 권한 필터), `npx tsc -b --noEmit`, `npx vite build` 통과.
- mock 화면: 오수학 → 2학년 3반 수학 → "이번 주 질문 핵심" 카드에 묶음과 학생 수, "새로 만들기" 로딩 → 결과, 4반은 "적어서 요약하지 않았어요", 375px 넘침 없음.
- 백엔드 요청서 `docs/backend/2026-11-14-backend-request-v1.1-question-themes.md`(엔드포인트, 입력 필터, 프롬프트 지침, 출력 스키마, 3명 규칙, 저장·횟수, 평가셋).

## 전체 제약
- TDD는 동작 하나씩: 테스트 하나 → 실패 확인 → 구현 → 통과. 보고에 동작마다 `RED: <테스트 이름> → <실패 메시지 한 줄>`. import·컴파일 오류나 없는 이름으로 난 실패는 RED가 아니다. stub을 먼저 두고 기대값 불일치로 실패하는 것을 본다.
- 리뷰 지적·버그를 고칠 때는 같은 원인·패턴의 문제를 같은 모듈과 같은 입력 경로에서 찾아 함께 고친다. 보고에 `같은 종류 검색: <검색어·확인한 경로> → 찾음 N, 고침 M, 남김(이유)`.
- 실제 모드는 기능 플래그 `FEATURES.questionThemes = USE_MOCK`(백엔드 반영 전). `.env` 등 비밀 파일 읽지 않기. 새 CSS 접두사 `qth-`. 문구는 단정하지 않음("참고용").

### Task 1: 타입·순수 함수·mock API
- `types/domain.ts`: `QuestionTheme = { title: string; studentCount: number; topicName: string | null }`, `QuestionThemes = { classId; subject; weekStart; generatedAt: string | null; status: "OK" | "FEW" | "EMPTY"; themes: QuestionTheme[]; hiddenCount: number }`.
- `lib/questionThemes.ts`: `finalizeThemes(raw: Array<{ title; questionIds: string[]; topicName?: string | null }>, ownerOf: Record<string, string>): { themes: QuestionTheme[]; hiddenCount: number }` — 서로 다른 학생 수 계산, 3명 미만 제거(hiddenCount), 학생 수 내림차순·제목 오름차순, 최대 5개, 제목 60자 자르기. `mockThemeGroups(questions)` — 주제·유형 기반 규칙 묶음.
- `Api`: `getQuestionThemes(classId, subject): Promise<QuestionThemes>`(저장된 것, 없으면 status EMPTY), `generateQuestionThemes(classId, subject): Promise<QuestionThemes>`. 권한은 교과 교사 배정(기존 `hasAssignment`), 입력은 세 동의 + TEACHER + 이번 주 + 그 과목. mock 지연 1~2초. supabase는 `ApiError("UNKNOWN", "question themes not deployed")`.
- mock 시드: c1 수학 이번 주 질문 — "꼭짓점 구하는 순서" 계열 4명, "판별식 관계" 계열 3명, 2명짜리 묶음 하나(숨김 확인용). 미동의 학생 질문 1개(제외 확인용).
- [ ] RED/GREEN, 테스트·tsc 통과, 커밋 `feat: 과목 질문 핵심 요약 — 순수 함수·mock`

### Task 2: 화면
- `SubjectClassPage`에 카드 "이번 주 질문 핵심": 로딩·오류·EMPTY("아직 요약이 없어요 · 새로 만들기")·FEW("질문한 학생이 적어 요약하지 않았어요")·OK(묶음 목록: 핵심 한 줄, "학생 N명", 주제 배지, 숨긴 묶음 안내), 머리 "AI 요약 · 참고용 · 11월 14일 13:20 만듦", "새로 만들기"(진행 중 비활성·aria-busy). 플래그 꺼지면 카드 없음.
- [ ] tsc·build 통과, 커밋 `feat: 과목 질문 핵심 요약 — 화면`

### Task 3: 문서
- 백엔드 요청서 v1.1, `docs/api-spec.md`, `docs/decisions.md`(사용자 결정 A, Claude 기본값: 교과 교사 화면만, 3명 규칙, 서버가 학생 수 계산, 저장·새로 만들기), `docs/05-data-flow.md`(질문 → AI 전송 행), `docs/PROJECT_LOG.md`.
- [ ] 커밋 `docs: 과목 질문 핵심 요약`
