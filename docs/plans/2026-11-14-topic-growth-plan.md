# 주제별 성장 + 객관적 테스트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 과목·단원 선택 없이, AI가 학습 기록에서 주제를 뽑고 주제마다 고정 난이도 5문항으로 수준을 재며, 주제별 성장을 학생·교사가 본다.

**Architecture:** `feat/unit-quiz`의 테스트 기반(출제 스냅샷·선택지 섞기·세션당 1회·정답 비공개)을 재사용하되 단원(Unit) 개념을 반 단위 주제 사전(Topic)으로 바꾼다. mock은 키워드 사전 + 주제별 문항 풀로 AI를 흉내 낸다. 실제 백엔드용 명세 v0.5·마이그레이션 SQL 초안을 함께 작성한다.

**Tech Stack:** React 19, TS, TanStack Query 5, Vitest 5, Supabase(실제 모드)

**Spec:** `docs/01-mvp.md` "주제별 성장 + 객관적 테스트"

## Global Constraints
- 테스트 5문항 고정(개념 확인 3 + 적용 2), 객관식·O/X, 난이도는 학생과 무관하게 같음
- 같은 주제는 반의 문항 풀 재사용, 풀이 5문항 미만일 때만 새로 생성해 추가
- 주제는 세션당 1~3개, 근거 기록 ID 필수, 근거 없으면 주제 만들지 않음
- 신고한 문항은 그 응시의 채점에서 제외(분모에서 빠짐), 교사 "신고된 문제"에 표시
- 학생 응답 전 정답·해설 비공개, 출제 스냅샷 채점, 객관식 선택지 섞기, 세션당 1회
- 기록 공유 동의 없으면 교사에게 주제·결과 비공개
- 고정 문구: "테스트는 공부 확인용이에요. 성적에 들어가지 않아요."
- 실제 모드는 백엔드 반영 전까지 이 기능 숨김(`FEATURES.quiz`)

## Review Focus
1. 기록에 없는 주제가 만들어짐(근거 0개) → 주제 생성 거부 (Task 1 테스트)
2. 같은 개념이 다른 이름으로 쪼개짐("꼭짓점" vs "이차함수 꼭짓점") → 사전 정규화로 같은 주제 (Task 1 테스트)
3. 학생 A와 B가 같은 주제에서 다른 문항 풀을 받음 → 풀 재사용 (Task 2 테스트)
4. 신고 후 점수 분모 처리, 신고 남발(전부 신고) → 0문항 채점은 정답률 null (Task 2 테스트)
5. 다른 학생 세션 주제 추출·응시·신고 → NOT_FOUND (Task 1·2 테스트)

---

### Task 1: 주제 사전·주제 추출 API
**Files:** `types/domain.ts`, `api/types.ts`, `api/mockTopicData.ts`(신규), `api/mockData.ts`, `api/mockApi.ts`, test `mockApi.test.ts`
**Produces:**
```ts
type Topic = { id: string; classId: string; name: string; subject?: string };
type SessionTopic = { topicId: string; name: string; subject?: string; evidenceIds: string[] };
extractTopics(sessionId: string): Promise<SessionTopic[]> // 본인 ENDED 세션, 결과 캐시
```
- [ ] 실패 테스트: `기록 키워드로 주제를 뽑고 근거 기록을 붙인다`, `근거가 없는 주제는 만들지 않는다`(키워드 없는 기록 → []), `같은 개념은 반 주제 사전의 같은 주제로 묶인다`(두 세션이 "꼭짓점"/"완전제곱식" → 같은 topicId), `PRIVATE 기록은 주제 근거로 쓰지 않는다`, `다른 학생 세션은 NOT_FOUND`, `진행 중 세션은 SESSION_NOT_ACTIVE`
- [ ] RED 확인 → 구현 → GREEN → 커밋 `feat(topic): 주제 사전·주제 추출`

### Task 2: 주제 테스트·신고 API (단원 테스트 대체)
**Produces:** `getQuiz(sessionId, topicId)`, `submitQuiz(sessionId, answers)`(기존 유지), `reportQuestion(sessionId, questionId, reason)`, `QuizAttempt.topicId`, `QuizResultItem.reported`, `QuizAttempt.total`은 신고 제외 수
- [ ] 실패 테스트: `주제 테스트는 5문항 고정이다`, `같은 반 다른 학생도 같은 주제는 같은 문항 풀에서 나온다`, `이번 세션에서 추출된 주제만 응시할 수 있다`(QUIZ_NOT_AVAILABLE), `신고한 문항은 채점에서 빠진다`, `전부 신고하면 정답률을 계산하지 않는다`(total 0), `신고는 응시한 본인만`
- [ ] 단원 관련 API·테스트 제거(`listUnits`·문항 관리·`getStudentOverview`) — 대체 테스트로 규칙 유지
- [ ] RED → 구현 → GREEN → 커밋 `feat(topic): 주제별 고정 난이도 테스트·신고`

### Task 3: 주제별 성장·신고 문제 API
**Produces:**
```ts
type TopicGrowth = { topicId: string; name: string; subject?: string; sessions: number; minutes: number;
  firstRate: number | null; lastRate: number | null; attempts: number; lastUnderstanding: 1|2|3|null; signal: "OVERCONFIDENT"|"LOW_SCORE"|null };
getTopicGrowth(studentId: string): Promise<{ shared: boolean; topics: TopicGrowth[] }> // 학생 본인·교사(자기 반)
listReportedQuestions(classId: string): Promise<ReportedQuestion[]> // 교사
resolveReport(reportId: string, action: "KEEP_EXCLUDED" | "DISMISS"): Promise<void>
```
- [ ] 실패 테스트: `처음과 최근 정답률로 성장을 보여 준다`, `공유 미동의면 교사에게 횟수·시간만`, `학생은 다른 학생 성장을 볼 수 없다`, `교사는 자기 반 신고 문제만 본다`, `신고 기각하면 그 문항은 다시 채점에 들어간다`(재계산)
- [ ] RED → 구현 → GREEN → 커밋 `feat(topic): 주제별 성장·신고 문제 API`

### Task 4: 학생 화면
- 시작: "오늘 할 것" 자유 입력(필수) + 활동 체크(선택), 과목·단원 제거
- 마치기: 주제 추출 결과(근거 펼치기) → 주제 선택 → 5문항(문항마다 "이상해요" 신고) → 결과 → 돌아보기
- 내 기록 상단 "내 성장" 주제 카드
- [ ] tsc 통과 → 브라우저(mock): 꼭짓점 기록 → 주제 "이차함수 꼭짓점" → 5문항 → 1개 신고 → 4문항 기준 결과 → 내 성장 카드 → 커밋

### Task 5: 교사 화면
- 학생 상세 상단 주제별 성장 표 + 신호, `/teacher/reports` 신고된 문제(유지/기각), 단원 문제 화면 제거
- [ ] tsc → 브라우저(mock): 신고 문항 확인·기각 → 학생 점수 재계산 반영 → 커밋

### Task 6: 실제 모드 연결 준비·명세
- `supabaseApi`에 새 엔드포인트 호출 추가(백엔드 반영 전 `FEATURES.quiz=false`)
- `docs/api-spec.md` v0.5 + `docs/backend/2026-11-14-topic-growth.sql`(마이그레이션 초안, RLS 포함)
- [ ] vitest·tsc·build·비밀키 검색 → 커밋 → 최종 리뷰(Opus)
