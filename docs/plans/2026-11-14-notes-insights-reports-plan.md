# 계획: 학생 '내 정리' 탭 · 교사 판단 문장 · 신고 AI 1차 검토 (2026-11-14)

브랜치 `feat/notes-insights-reports` (T9 브랜치 `feat/t9-feedback-waiting` 위에서 시작, T9는 아직 master 미병합).

## 사용자 결정
- 내 정리: 메모 + 돌아보기 + 남은 질문 (AI 질문은 빼기)
- 교사 판단: 규칙 기반 문장 (서버 변경 없음, 근거 숫자 함께)
- 신고: **같은 문항 기준**. 문항의 첫 신고는 AI가 검토, 같은 문항이 다시 신고되면 교사에게. AI가 걸러 낸 신고도 학생별 신고 수에 센다.
- 진행: mock 먼저 + 백엔드 요청서

## ① 학생 '내 정리' 탭
- 내 기록 화면에 탭 `학습 목록 | 내 정리` (`?tab=notes`).
- API `listMyNotes()` (학생 본인): 내 모든 세션의 기록(비공개 포함)과 돌아보기. 실제 모드는 `v_entries`·`v_reflections`를 세션 ID로 묶어 조회.
- 순수 함수 `lib/notebook.ts`: 세션별로 메모·돌아보기를 묶고 최근 순, 검색어로 거름. 남은 질문은 위에 따로 모아 보여 줌.

## ② 교사 판단 문장 (T1 포함)
- 순수 함수 `lib/insights.ts`: 학생 숫자 → `{ tone: "warn" | "good" | "info", text, evidence, action }` 목록, 경고 먼저, 최대 4개.
- 규칙: 학습 없음/반 평균 절반 이하, 주제 신호(이해했다는데 점수 낮음·점수 낮음), 정답률 20%p 이상 상승, 답 요청 질문 비율 50% 이상(질문 4개 이상), 남은 질문 3개 이상, 피드백 기다림, 기록 비공개 안내.
- 표시: 학생 상세 '요약' 탭 맨 위 "한눈에 보기", 대시보드 상태 칸에 첫 문장 한 줄.

## ③ 신고 AI 1차 검토·카운팅
- `reportQuestion` 응답 `{ review: "AI_OK" | "AI_ERROR" | "TO_TEACHER", message }`.
  - 같은 문항의 첫 신고 → AI 검토. 문제 없음(`AI_OK`) → 신고 상태 `AI_CLEARED`, 그 학생 채점에 포함, 교사 목록에 안 뜸. 오류(`AI_ERROR`) → 채점 제외, 교사 목록에 "AI도 오류로 봄".
  - 같은 문항 두 번째 신고부터 → 채점 제외, 교사 목록 (`TO_TEACHER`).
  - 같은 학생이 같은 출제 문항을 다시 신고해도 한 번으로 침(같은 결과 반환).
- `ReportedQuestion`에 `status: "AI_CLEARED"`, `aiReview`, `questionReportCount` 추가. 교사 화면은 `AI_CLEARED`를 목록에서 빼고, 학생별 신고 수(걸러진 신고 포함)를 따로 보여 줌.
- 백엔드 미반영 상태의 실제 모드: 응답에 `review`가 없으면 `TO_TEACHER`로 봄(지금과 같은 동작).

## 완료 기준
1. `npx vitest run`: notebook·insights 순수 함수 테스트, mock `listMyNotes`·신고 흐름(첫 신고 AI_OK/AI_ERROR, 두 번째 TO_TEACHER, 중복 신고, 학생별 수) 테스트 통과.
2. `npx tsc -b --noEmit` 출력 없음, `npx vite build` 성공.
3. mock 미리보기: 내 정리 탭, 학생 상세 한눈에 보기, 대시보드 한 줄, 신고 결과 문구·교사 신고 화면을 확인하고 375px 가로 넘침 없음.
4. 백엔드 요청서 7장에 `listMyNotes` 조회 확인·신고 AI 검토 명세.
