# 사용성 개선 Implementation Plan

> 실행: 이 세션에서 직접(inline), 끝에 Opus 독립 리뷰. Steps use checkbox (`- [ ]`).

**Goal:** 기능은 그대로 두고 "보기 힘든" 화면을 쓸 만하게 만든다. 근거: 2026-11-14 화면 점검(mock, 데스크톱 약 780px·모바일 375px).

**Architecture:** 화면 구조만 바꾼다(탭·표·요약 카드). 새 로직은 순수 함수로 빼서 테스트한다. 백엔드·Api 인터페이스는 바꾸지 않는다.

**Tech Stack:** React 19, react-router 7, react-query 5, tailwind 4, vitest. 새 의존성 없음.

## Global Constraints
- 기존 Api 메서드만 사용. 새 요청이 생기면 학생 홈은 최근 세션 5개까지만 추가 호출.
- 순위·정렬 UI 금지(반목표 유지). 학생 목록은 번호순.
- 기록 공유 미동의 학생 처리 문구·동작은 지금과 같게.
- 좁은 화면(≥375px)에서 가로 스크롤은 표 컨테이너 안에서만.

## Review Focus
1. 탭을 URL(`?tab=`)로 기억 → 새로고침·뒤로가기에서 같은 탭. 잘못된 값이면 요약 탭.
2. 학생 상세 학습 기록 탭: `?session=` 선택과 탭 상태가 같이 유지.
3. 이름 검색: 공백·대소문자·번호("5") 입력, 결과 0명일 때 빈 문구, 검색하면 1쪽으로.
4. 학생 홈 요약: 학습 0회·피드백 0개·테스트 없음일 때 "-"와 안내, 오류 없음.
5. 모바일 내 기록: 학습을 고르면 상세로 스크롤.

---

### Task 1: 교사 학생 상세를 탭으로
**Files:** Modify `features/teacher/StudentDetailPage.tsx`, `features/teacher/StudentProfile.tsx`; Create `lib/tabs.ts`(+test)
- `export function parseTab<T extends string>(v: string | null, allowed: readonly T[], fallback: T): T` — 테스트: 허용값, null, 이상한 값 → fallback.
- 탭: **요약**(종합 숫자·유형 비율 + 주제별 성장) / **학습 기록**(왼쪽 목록, 오른쪽 상세 + 피드백 칸을 상세 위쪽에) / **AI 질문**(질문 원문 목록) .
- `StudentProfile`을 `ProfileSummary`(숫자·유형)와 `QuestionList`(원문)로 나눠 탭에 배치.
- 학습 기록 탭에서 상세의 확인 테스트 문항은 기본 접힘(`<details>`), 결과 점수만 보임.
- [ ] parseTab RED → GREEN
- [ ] 화면 확인(mock): 탭 전환, `?tab=records&session=…` 새로고침 유지, 피드백 칸이 화면 첫 높이 안에
- [ ] Commit

### Task 2: 표 가독성 + 이름 검색
**Files:** Modify `features/teacher/ClassDashboard.tsx`, `features/teacher/AnalyticsPage.tsx`; Create `lib/studentSearch.ts`(+test)
- `export function matchStudent(s: { name: string; number: number }, q: string): boolean` — 공백 제거·소문자, 숫자만이면 번호 일치, 아니면 이름 포함. 빈 검색은 true.
- 두 표: 셀 `whitespace-nowrap`, 좁은 화면(<md)에서 덜 중요한 칸 숨김(대시보드: 최근·남은 질문, 반 분석: 주로 한 질문). 표 위에 이름·번호 검색창, 검색어 바뀌면 1쪽.
- 두 화면 제목 아래 역할 한 줄: 대시보드 "오늘 챙길 학생", 반 분석 "공부 방식과 분포".
- [ ] matchStudent RED → GREEN
- [ ] 화면 확인(mock, 약 780px): 이름 줄바꿈 없음, 검색 "가온"·"5"·"없는이름"
- [ ] Commit

### Task 3: 학생 홈 요약 + 새 피드백
**Files:** Modify `features/student/StudentHome.tsx`(실제 경로 확인); Create `lib/studentHome.ts`(+test)
- `export function summarizeWeek(sessions: LearningSession[], now: Date): { count: number; minutes: number }` — 최근 7×24시간 시작 세션, ACTIVE는 0분.
- `export function latestTested(topics: TopicGrowth[]): TopicGrowth | null` — `attempts > 0` 중 첫 번째(서버 정렬 그대로), 없으면 null.
- 홈 카드 3개: 이번 주 학습(횟수·시간), 최근 확인 테스트(주제·최근 정답률, 없으면 안내), 선생님 피드백(최근 세션 5개의 피드백 중 최근 7일 것 개수 + 가장 최근 내용 한 줄 + 해당 기록으로 가는 링크).
- [ ] summarizeWeek·latestTested RED → GREEN
- [ ] 화면 확인(mock): 피드백 있는 학생/없는 학생
- [ ] Commit

### Task 4: 내 기록 피드백 표시 + 모바일 스크롤
**Files:** Modify `features/records/MyRecordsPage.tsx`
- 학습 목록 카드에 피드백이 있으면 "선생님 피드백" 배지(Task 3과 같은 쿼리 키 재사용, 최근 5개 세션만).
- 학습을 고르면 좁은 화면(<lg)에서 상세 카드로 `scrollIntoView`.
- [ ] 화면 확인(mock 모바일): 고르면 상세로 이동, 배지 표시
- [ ] Commit

### Task 5: 마무리
- [ ] 전체 vitest·tsc·build, 실제 모드 교사 학생 상세 탭 열림 확인
- [ ] Opus 독립 리뷰 → Critical/Important 한 번에 수정(RED→GREEN)
- [ ] security-check, PROJECT_LOG, 커밋

## 이번에 하지 않음
- 학습 목록 카드에 주제 표시(교사 쪽 세션별 주제 조회 경로가 없어 Api 추가 필요) → 다음.
- mock 전용 "채점 확정 대기" 숫자 정리 → 데모 범위 결정 필요.
- 반 대시보드·반 분석 통합 → 이번엔 역할 문구로 구분만.
