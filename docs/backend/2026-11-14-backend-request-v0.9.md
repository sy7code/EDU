# 백엔드 요청 v0.9 (프론트 → 백엔드, 2026-11-14) — 교과 교사

이 문서 하나만 읽어도 되도록 썼다. 배경 계획: `docs/plans/2026-11-14-subject-teacher-plan.md`. 프론트 규칙 원문: `docs/api-spec.md` "v0.6 교과 교사".

**왜 필요한가**: 담임이 아닌 교과 교사(국어·수학·영어·사회·과학)가 자기가 가르치는 반·과목의 학습만 보게 한다. 지금은 프론트 mock(`FEATURES.subjectTeacher = USE_MOCK`)만 이 규칙을 구현한다. 프론트가 거르는 것은 표시용이고, **서버 RLS가 기준**이다. 조건 하나가 빠지면 다른 과목·다른 반 기록이 새어 나간다.

**SQL은 모두 "제안 SQL"이다.** 기존 스키마(정책 이름, `teaches_student` 정의, `sessions` 컬럼 등)를 이 문서 작성자가 전부 보지 못했다. 최종 스키마는 백엔드가 정한다. 의미(조건·결과)가 같으면 형태는 달라도 된다.

## 0. 한눈에

| # | 우선 | 요청 | 종류 |
|---|---|---|---|
| A | 높음 | `teacher_assignments` 테이블, `current_term()`, `v_my_assignments` | 새 테이블·함수·view |
| B | 높음 | `consents.kind`에 `SUBJECT_SHARE` 허용, `subject_share_active()` | 변경 |
| C | 높음 | `sessions.subject` 컬럼(C-0), `teaches_subject()` + 읽기 정책 6개에 `OR` 조건 | 변경 (보안 핵심) |
| D | 높음 | `feedback` 교과 교사 쓰기 + `author_subject` 서버 채움 | 변경 |
| E | 높음 | `log_student_view(student_id, subject)` 확장, `audit_logs.subject` | 변경 |
| F | 높음 | RPC `subject_week_summary(class_id, subject)`, `subject_students(class_id, subject)` | 새 함수 |
| G | 높음 | 거부 테스트 (다른 과목·다른 반·미동의·지난 학기) | 테스트 |
| H | - | 프론트 플래그 켜는 조건 | 조건 |

## 1. 규칙 (프론트 코드와 같은 의미)

| 항목 | 규칙 | 프론트 원문 |
|---|---|---|
| 과목 | `국어·수학·영어·사회·과학`만. `기타`·목록 밖·빈 값은 배정도 열람도 없음 (fail-closed) | `lib/checklists.ts` `SUBJECTS`, `lib/subjectAccess.ts` |
| 현재 학기 | **서울 날짜** 3~8월 `YYYY-1`, 9~12월 `YYYY-2`, 1~2월 `(YYYY-1)-2` | `lib/schoolCalendar.ts` `currentTerm` |
| 주 | 서울 월요일 00:00 ~ 일요일 23:59 | `seoulWeekStart`, `isInSeoulWeek` |
| 열람 조건 (모두) | ① 현재 학기 배정(교사 = `auth.uid()`, 학생 반, 세션 `sessions.subject`) ② 세션이 **현재 학기에 시작** ③ 학생 `LEARNING_RECORD` 동의 ④ 학생 `SUBJECT_SHARE` 동의 | `canSubjectTeacherSee` |
| 기록 범위 | `entries`는 `visibility = 'TEACHER'`만. 성찰·퀴즈 응시·세션 주제·피드백은 세션 단위로 같은 조건 | |
| 제외 | **AI 대화(`ai_messages`)는 교과 교사에게 0행.** 평가(assessment) 관련 API·테이블 접근 없음 | v0.6 표 |
| 학생이 `LEARNING_RECORD`를 끔 | `SUBJECT_SHARE` 값과 관계없이 교과 교사에게 안 보임 (서버가 강제) | `subjectShareActive` |
| 담임 겸 교과 교사 | 자기 반 학생은 담임 범위(기존), 다른 반은 배정 과목만. 둘을 섞지 않음 | |

---

## A. 배정 테이블·현재 학기·내 배정 (높음)

```sql
-- 제안 SQL
create table teacher_assignments (
  teacher_id uuid not null references users(id) on delete cascade,
  class_id   uuid not null references classes(id) on delete cascade,
  subject    text not null check (subject in ('국어','수학','영어','사회','과학')),  -- '기타' 불가
  term       text not null check (term ~ '^[0-9]{4}-[12]$'),                          -- 'YYYY-N'
  created_at timestamptz not null default now(),
  primary key (teacher_id, class_id, subject, term)
);
alter table teacher_assignments enable row level security;
-- 본인 배정만 읽기. 쓰기는 service_role(관리자 시드·콘솔)만.
create policy teacher_assignments_read on teacher_assignments for select using (teacher_id = auth.uid());
-- teacher_id가 role='teacher'인 users만 허용하는 검증은 백엔드 판단(트리거 또는 시드 규칙)

-- 현재 학기 (서울 날짜 기준). 인자 없으면 지금.
create or replace function current_term(ts timestamptz default now()) returns text
language sql immutable as $$
  select case
    when extract(month from ts at time zone 'Asia/Seoul') between 3 and 8
      then extract(year from ts at time zone 'Asia/Seoul')::int || '-1'
    when extract(month from ts at time zone 'Asia/Seoul') >= 9
      then extract(year from ts at time zone 'Asia/Seoul')::int || '-2'
    else (extract(year from ts at time zone 'Asia/Seoul')::int - 1) || '-2'
  end
$$;

-- 프론트 listMyAssignments() -> TeacherAssignment { teacherId, classId, subject, term }
create view v_my_assignments with (security_invoker = true) as
  select teacher_id as "teacherId", class_id as "classId", subject, term
  from teacher_assignments
  where teacher_id = auth.uid() and term = current_term();
grant select on v_my_assignments to authenticated;
```

- `current_term` 확인: 2026-03-01 00:00 KST → `2026-1`, 2026-08-31 23:59 KST → `2026-1`, 2026-09-01 → `2026-2`, 2027-01-15 → `2026-2`, 2027-02-28 → `2026-2`. UTC로 2026-02-28 15:00은 서울 3월 1일 00:00이라 `2026-1`이어야 한다.
- 학생이 호출하면 `v_my_assignments`는 0행이다(프론트 mock은 `403`이지만 0행이면 화면이 빈 상태로 처리한다).

## B. 동의 종류 (높음)

```sql
-- 제안 SQL (제약 이름은 \d consents 로 확인)
alter table consents drop constraint if exists consents_kind_check;
alter table consents add constraint consents_kind_check
  check (kind in ('FACEPASS','AI','LEARNING_RECORD','SUBJECT_SHARE'));

-- 종류별 최신 행이 현재 값. SUBJECT_SHARE는 행이 없으면 false(옵트인).
-- LEARNING_RECORD는 기존 shares_record() 규칙 그대로 재사용(행 없으면 기존 정책을 따름).
create function subject_share_active(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select shares_record(sid)
     and coalesce((select granted from consents
                   where student_id = sid and kind = 'SUBJECT_SHARE'
                   order by created_at desc limit 1), false)
$$;
revoke execute on function subject_share_active(uuid) from public;
```

- **`LEARNING_RECORD`를 끈 학생은 `SUBJECT_SHARE`가 켜져 있어도 `false`**: 위 함수가 `shares_record(sid)`를 함께 본다(정책에서 강제). 선택 보강: `LEARNING_RECORD`를 `granted=false`로 insert할 때 `SUBJECT_SHARE`도 `granted=false`로 한 행 넣는 트리거. 프론트(`lib/consentSave.ts`)는 이미 `SUBJECT_SHARE`를 `LEARNING_RECORD`가 꺼지면 `false`로 저장한다. 서버는 클라이언트를 믿지 않는다.
- 동의는 덮어쓰지 않고 이력으로 append(기존 규칙 그대로). 변경은 `audit_logs`(`CONSENT_CHANGE`) 기존대로.
- **열린 질문**: 만 14세 미만 학생의 `granted=true`는 보호자 동의(`by_guardian = true`)가 필요한지 정책이 아직 정해지지 않았다(`docs/00-review.md`). 기존 `LEARNING_RECORD` 규칙(`docs/api-spec.md` 동의 6번)과 같게 갈지 백엔드·기획이 정해 달라. 정해지기 전까지 `SUBJECT_SHARE`도 같은 `by_guardian` 검사를 적용하는 쪽을 제안한다(더 보수적).

## C-0. 세션 과목 컬럼 `sessions.subject` (높음, C의 전제)

현재 `sessions.goal`은 텍스트 하나(`"과목 | 활동라벨, ... | 메모"`, 프론트 `goalToText`)다. **접근 판단은 이 텍스트를 파싱하는 것에 의존하면 안 된다**(자유 입력 메모·구분자로 깨질 수 있음). 과목을 별도 컬럼으로 둔다.

```sql
-- 제안 SQL
alter table sessions add column subject text;
-- 기존 행 1회 백필: goal 첫 칸. 목록 밖 값은 '기타'
update sessions set subject = case
  when split_part(goal, ' | ', 1) in ('국어','수학','영어','사회','과학') then split_part(goal, ' | ', 1)
  else '기타' end
where subject is null;
alter table sessions alter column subject set not null;
alter table sessions add constraint sessions_subject_check
  check (subject in ('국어','수학','영어','사회','과학','기타'));
-- v_sessions 에 subject 열 추가 (학생·담임·교과 교사 모두 읽음)
```

- 세션 생성(insert) 시점에 클라이언트가 보낸 `subject`를 저장한다. 시작 이후 변경 불가(update 정책·트리거로 막는 것을 제안). `goal` 텍스트는 그대로 두고 표시용으로만 쓴다.
- `기타`는 저장되지만 교과 교사 열람·배정은 항상 없다(C의 함수가 5개 과목만 허용).
- **프론트 후속**: `supabaseApi`의 `startSession`이 컬럼 생성 후 `subject`를 함께 보낸다(프론트 작업). 그때까지 `FEATURES.subjectTeacher`는 실제 모드에서 꺼 둔다.

## C. 열람 권한 함수와 읽기 정책 (높음, 보안 핵심)

```sql
-- 제안 SQL
-- 학생 sid의 (과목, 시작 시각) 학습을 지금 로그인한 교사가 교과 교사로 볼 수 있는가
create function teaches_subject(sid uuid, subj text, started timestamptz) returns boolean
language sql stable security definer set search_path = public as $$
  select app_role() = 'teacher'
     and subj in ('국어','수학','영어','사회','과학')               -- 빈 값·기타·목록 밖 -> false (null이면 false)
     and started is not null
     and current_term(started) = current_term()                    -- 지난 학기 학습은 안 보임
     and subject_share_active(sid)
     and exists (
       select 1
       from users st
       join teacher_assignments ta on ta.class_id = st.class_id
       where st.id = sid and st.role = 'student' and st.class_id is not null
         and ta.teacher_id = auth.uid()
         and ta.subject = subj
         and ta.term = current_term())
$$;
revoke execute on function teaches_subject(uuid, text, timestamptz) from public;
grant execute on function teaches_subject(uuid, text, timestamptz) to authenticated;

-- 세션 id 기준 (entries·reflections·session_topics·quiz_attempts·feedback 정책용)
create function teaches_subject_session(sess uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from sessions s
                 where s.id = sess and teaches_subject(s.student_id, s.subject, s.started_at))
$$;
revoke execute on function teaches_subject_session(uuid) from public;
grant execute on function teaches_subject_session(uuid) to authenticated;
```

읽기 정책 변경 (기존 정책 이름은 확인 후 맞춰 주세요. 아래는 의미):

```sql
-- sessions: 기존 (student_id = auth.uid() or teaches_student(student_id)) 에 OR 추가
--   or teaches_subject(student_id, subject, started_at)

-- entries: TEACHER 공개분만
drop policy entries_read on entries;
create policy entries_read on entries for select using (
  owns_session(session_id)
  or (visibility = 'TEACHER' and (teaches_shared_session(session_id) or teaches_subject_session(session_id))));

-- reflections / session_topics / quiz_attempts
drop policy reflections_read on reflections;
create policy reflections_read on reflections for select
  using (owns_session(session_id) or teaches_shared_session(session_id) or teaches_subject_session(session_id));
drop policy session_topics_read on session_topics;
create policy session_topics_read on session_topics for select
  using (owns_session(session_id) or teaches_shared_session(session_id) or teaches_subject_session(session_id));
drop policy quiz_attempts_read on quiz_attempts;
create policy quiz_attempts_read on quiz_attempts for select
  using (owns_session(session_id) or teaches_shared_session(session_id) or teaches_subject_session(session_id));

-- feedback 읽기: 기존 조건 + or teaches_subject_session(session_id)

-- ai_messages: 변경 없음. teaches_subject_* 를 추가하지 말 것 (교과 교사는 0행).
```

- `ai_messages_read`와 평가(assessment) 관련 정책에는 **`teaches_subject*`를 넣지 않는다.** 교과 교사가 `getAssessment`를 부르면 `null`, 요청·확정은 `403`이 프론트 규칙이다. 서버는 담임 조건(`teaches_student`) 그대로 두면 교과 교사에게 0행·거부가 된다.
- 위 정책은 `teaches_student`(담임 판단)를 건드리지 않는다. 담임 겸 교과 교사가 **다른 반**에서는 `teaches_student`가 거짓이라 교과 조건만 적용된다.
- `v_sessions`·`v_entries`·`v_reflections`·`v_quiz_attempts`·`v_session_topics`·`v_feedback`는 `security_invoker = true`라 정책이 그대로 적용된다. 프론트는 교과 교사일 때 `v_sessions`를 `studentId`와 과목(`v_sessions.subject`)으로 거른다. 과목 필터가 없어도 정책이 막는다(권한 밖은 빈 결과).
- 퀴즈 정답·해설: `quiz_attempts.items`에는 정답·해설이 들어 있다(기존). 교사에게 이미 열려 있는 담임 경로와 같은 정보다. 교과 교사도 응시 결과를 볼 수 있다는 것이 현재 프론트 결정이다(`getQuizAttempt`).

## D. 피드백 (높음)

```sql
-- 제안 SQL
alter table feedback add column author_subject text
  check (author_subject is null or author_subject in ('국어','수학','영어','사회','과학'));

-- 쓰기: 작성자 본인이면서 (기존 담임 조건 or 교과 교사 열람 조건)
-- 기존 feedback_insert 정책의 with check 에 아래 OR 추가
--   teacher_id = auth.uid() and (<기존 담임 조건> or teaches_subject_session(session_id))

-- 서버가 채운다. 클라이언트 값은 항상 덮어쓴다.
create function feedback_set_author_subject() returns trigger
language plpgsql security definer set search_path = public as $$
declare s sessions%rowtype;
begin
  if tg_op = 'UPDATE' then
    new.author_subject := old.author_subject;   -- 수정으로 바꿀 수 없음
    return new;
  end if;
  select * into s from sessions where id = new.session_id;
  new.teacher_id := auth.uid();
  new.author_subject := case when teaches_student(s.student_id) then null  -- 담임
                             else s.subject end;                  -- 교과 교사
  return new;
end $$;
create trigger feedback_author_subject before insert or update on feedback
  for each row execute function feedback_set_author_subject();

-- v_feedback: "authorSubject" 노출 (담임·학생 모두 읽음)
-- create or replace view v_feedback ... add: author_subject as "authorSubject"
```

- 담임이 쓰면 `null`, 담임이 아니면 그 세션 과목. 담임 겸 교과 교사라도 자기 반 학생에게는 담임 규칙(`null`).
- 배정이 학기 중 바뀌어도 그때 과목을 유지한다(표시용 스냅숏, `docs/03-erd.md`).
- 학생 `markFeedbackRead`(`read_at`)는 기존 그대로 학생 본인 것만.

## E. 열람 기록 `log_student_view` 확장 (높음)

```sql
-- 제안 SQL
alter table audit_logs add column subject text;   -- 교과 교사 열람이면 그 과목, 담임이면 null

-- 기존 log_student_view(p_student_id) 를 아래로 교체 (이름·반환형은 기존 정의에 맞춰 주세요)
create or replace function log_student_view(p_student_id uuid, p_subject text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if teaches_student(p_student_id) then
    insert into audit_logs(actor_id, action, target_student_id, subject)
    values (auth.uid(), 'VIEW_STUDENT_DETAIL', p_student_id, null);        -- 담임이면 과목 없이
  elsif p_subject is not null and teaches_subject(p_student_id, p_subject, now()) then
    insert into audit_logs(actor_id, action, target_student_id, subject)
    values (auth.uid(), 'VIEW_STUDENT_DETAIL', p_student_id, p_subject);   -- 교과 교사
  else
    raise exception 'NOT_FOUND' using errcode = 'P0002';                  -- 권한 없음, 존재도 숨김
  end if;
end $$;

-- v_audit_logs: "subject" 열 추가 (학생: 내 기록을 본 사람, 교사: 내가 연 기록)
-- 기존 view에 subject 열을 더한다. 기존 필터(학생 본인 것·교사 자기가 한 것)는 그대로.
```

- 교과 교사는 `p_subject` 필수. 없으면 `NOT_FOUND`. 학생 단위 열람이라 세션 시각이 없어 `now()`(현재 학기)로 판단한다(프론트 mock과 같음).
- 담임이 `p_subject`를 같이 보내도 담임 경로가 먼저라 `subject = null`로 기록된다.
- `getSession` 열람 기록(`VIEW_SESSION`)을 서버가 남기고 있다면 같은 방식으로 `subject`를 넣어 주세요. 남기고 있지 않으면 요청 없음(프론트는 `logStudentView`만 쓴다).
- `v_audit_logs`는 교사에게 자기 행만, 학생에게 자기를 본 행만 계속 보여야 한다.

## F. RPC 두 개 (높음)

### F-1. `subject_students(p_class_id uuid, p_subject text)`

반 학생 중 `subject_share_active`인 학생을 번호순으로 돌려준다. 프론트 `listSubjectStudents` → `Student { id, name, classId, number }`.

```sql
-- 제안 SQL
create function subject_students(p_class_id uuid, p_subject text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not _has_assignment(p_class_id, p_subject) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'name', u.name,
                     'classId', u.class_id, 'number', coalesce(u.number, 0)) order by u.number)
                   from users u
                   where u.role = 'student' and u.class_id = p_class_id and subject_share_active(u.id)), '[]'::jsonb);
end $$;

create function _has_assignment(p_class_id uuid, p_subject text) returns boolean
language sql stable security definer set search_path = public as $$
  select app_role() = 'teacher'
     and p_class_id is not null
     and p_subject in ('국어','수학','영어','사회','과학')
     and exists (select 1 from teacher_assignments
                 where teacher_id = auth.uid() and class_id = p_class_id
                   and subject = p_subject and term = current_term())
$$;
```

### F-2. `subject_week_summary(p_class_id uuid, p_subject text)` — 반환 JSON

프론트 타입 `SubjectWeekSummary`(`frontend/src/types/domain.ts`)와 **키 이름·형이 같아야** 한다.

```ts
type CountCell = number | "적음";
type SubjectWeekSummary = {
  classId: string; subject: string; weekStart: string;   // weekStart = 서울 기준 그 주 월요일 "YYYY-MM-DD"
  few: boolean;
  sessionCount: number;
  studentCount: CountCell;
  topics: Array<{ topicId: string | null; name: string; studentCount: CountCell; reviewCount: CountCell; lastRate: number | null }>;
  hardQuestions: Array<{ questionId: string; prompt: string; rate: number; answered: number }>;
};
```

**규칙** (원문: `lib/subjectSummary.ts`, `lib/reviewTopics.ts`, `lib/topicSignal.ts`)

| 항목 | 내용 |
|---|---|
| 권한 | 배정(현재 학기, 반+과목)이 없으면 `NOT_FOUND`. 있으면 **서버가** 동의 학생(`subject_share_active`)·그 과목·현재 학기 시작 세션·이번 주(서울) 세션만 집계. 클라이언트가 학생 목록을 넘기지 않음 |
| 집계 대상 | 학습 학생 수 = 이번 주 세션을 가진 서로 다른 학생. AI 동의 여부·주제 유무와 관계없이 센다 |
| `few` | 학습 학생 1~2명이면 `true`. 이때 `topics = []`, `hardQuestions = []`, **`sessionCount = 0`** (건수로 개인이 추정되지 않게). 학생 0명이면 `few=false`, 모두 0·빈 배열 |
| 학생 수 칸 | `studentCount`, `topics[].studentCount`, `topics[].reviewCount`: 1~2면 문자열 `"적음"`, 0은 숫자 0, 3 이상은 숫자 |
| 주제 행 | 세션의 `session_topics`마다 한 행(학습 학생 수 = 그 주제를 공부한 서로 다른 학생). 주제가 하나도 없는 세션은 `topicId = null`, `name = "주제 없음"`, `reviewCount = 0`, `lastRate = null` 행 하나로 합친다 |
| 다시 볼 주제 | 학생별로, 주제마다 **이번 주 마지막 응시**(`created_at` 최대, `total > 0`)를 골라 신호가 있으면 그 학생을 `reviewCount`에 센다. 신호: `total >= 3`이고 (그 응시 세션 성찰 `understanding = 3` and 정답률 < 0.6 → `OVERCONFIDENT`) 아니면 정답률 < 0.4 → `LOW_SCORE`. 개수 제한 없음(uncapped) |
| `lastRate` | 학생별 그 주제 마지막 응시 정답률(`correct/total`, `total>0`)의 평균. **응시 학생이 3명 미만이면 `null`** |
| 정렬 | `reviewCount`(실제 수) 내림 → 학습 학생 수 내림 → 이름 오름(한국어 정렬). 정렬은 `"적음"` 변환 전의 실제 수로 |
| `hardQuestions` | 학생별·문항별 **마지막 응답**만 사용(세션 시작 시각 큰 것 → 같으면 응시 `created_at` → 문항 입력 순서가 뒤인 것). `reported = true`인 응답은 먼저 제외. 문항당 응답 학생 `answered >= 3`만. `rate = 정답 학생 수 / answered`, **`rate` 오름 → `questionId` 오름**, 상위 2개 |

```sql
-- 제안 SQL
-- 이번 주(서울) 집계 대상 세션: 동의 학생 + 그 과목 + 현재 학기 시작 + 이번 주
create function _subject_week_sessions(p_class_id uuid, p_subject text, p_week date)
returns table (session_id uuid, student_id uuid, started_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.id, s.student_id, s.started_at
  from sessions s
  join users u on u.id = s.student_id and u.role = 'student' and u.class_id = p_class_id
  where s.subject = p_subject
    and subject_share_active(s.student_id)
    and current_term(s.started_at) = current_term()
    and (s.started_at at time zone 'Asia/Seoul')::date >= p_week
    and (s.started_at at time zone 'Asia/Seoul')::date <  p_week + 7
$$;
revoke execute on function _subject_week_sessions(uuid, text, date) from public;

create function subject_week_summary(p_class_id uuid, p_subject text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_week date := date_trunc('week', now() at time zone 'Asia/Seoul')::date;  -- 월요일
  v_n int; v_sessions int; v_few boolean; v_base jsonb; v_topics jsonb; v_hard jsonb;
begin
  if not _has_assignment(p_class_id, p_subject) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  select count(distinct student_id), count(*) into v_n, v_sessions
  from _subject_week_sessions(p_class_id, p_subject, v_week);
  v_few := v_n between 1 and 2;
  v_base := jsonb_build_object(
    'classId', p_class_id, 'subject', p_subject, 'weekStart', to_char(v_week, 'YYYY-MM-DD'),
    'few', v_few, 'sessionCount', case when v_few then 0 else v_sessions end,
    'studentCount', case when v_few then to_jsonb('적음'::text) else to_jsonb(v_n) end);
  if v_n = 0 or v_few then
    return v_base || jsonb_build_object('topics', '[]'::jsonb, 'hardQuestions', '[]'::jsonb);
  end if;

  with ws as (select * from _subject_week_sessions(p_class_id, p_subject, v_week)),
  studied as (   -- (주제 또는 null, 학생)
    select distinct st.topic_id, ws.student_id
    from ws left join session_topics st on st.session_id = ws.session_id),
  last_att as (  -- 학생별·주제별 이번 주 마지막 응시
    select distinct on (qa.student_id, qa.topic_id)
           qa.student_id, qa.topic_id, qa.session_id, qa.correct, qa.total,
           qa.correct::float8 / qa.total as rate
    from quiz_attempts qa join ws on ws.session_id = qa.session_id
    where qa.total > 0
    order by qa.student_id, qa.topic_id, qa.created_at desc),
  reviewed as (
    select la.topic_id, la.student_id
    from last_att la
    left join reflections r on r.session_id = la.session_id
    where la.total >= 3
      and ((r.understanding = 3 and la.rate < 0.6) or la.rate < 0.4)),
  raw as (
    select s.topic_id,
           coalesce(t.name, case when s.topic_id is null then '주제 없음' else '' end) as name,
           count(*)::int as student_n,
           case when s.topic_id is null then 0
                else (select count(*) from reviewed rv where rv.topic_id = s.topic_id)::int end as review_n,
           case when s.topic_id is null then null
                else (select case when count(*) >= 3 then avg(la.rate) end
                      from last_att la where la.topic_id = s.topic_id) end as last_rate
    from studied s left join topics t on t.id = s.topic_id
    group by s.topic_id, t.name),
  resp as (      -- 학생별·문항별 마지막 응답 (신고 응답은 먼저 제외)
    select distinct on (i.item->>'questionId', ws.student_id)
           i.item->>'questionId' as qid, i.item->>'prompt' as prompt,
           coalesce((i.item->>'correct')::boolean, false) as correct
    from quiz_attempts qa
    join ws on ws.session_id = qa.session_id
    cross join lateral jsonb_array_elements(qa.items) with ordinality as i(item, ord)
    where not coalesce((i.item->>'reported')::boolean, false)
    order by i.item->>'questionId', ws.student_id, ws.started_at desc, qa.created_at desc, i.ord desc),
  hard as (
    select qid, (array_agg(prompt))[1] as prompt,
           count(*) filter (where correct)::float8 / count(*) as rate, count(*)::int as answered
    from resp group by qid having count(*) >= 3
    order by rate asc, qid collate "C" asc limit 2)
  select
    coalesce((select jsonb_agg(jsonb_build_object(
        'topicId', topic_id, 'name', name,
        'studentCount', case when student_n between 1 and 2 then to_jsonb('적음'::text) else to_jsonb(student_n) end,
        'reviewCount',  case when review_n  between 1 and 2 then to_jsonb('적음'::text) else to_jsonb(review_n) end,
        'lastRate', last_rate)
      order by review_n desc, student_n desc, name collate "ko-KR-x-icu" asc) from raw), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('questionId', qid, 'prompt', prompt, 'rate', rate, 'answered', answered)
      order by rate asc, qid collate "C" asc) from hard), '[]'::jsonb)
  into v_topics, v_hard;

  return v_base || jsonb_build_object('topics', v_topics, 'hardQuestions', v_hard);
end $$;
revoke execute on function subject_week_summary(uuid, text), subject_students(uuid, text), _has_assignment(uuid, text) from public;
grant execute on function subject_week_summary(uuid, text), subject_students(uuid, text) to authenticated;
```

- **권한이 함수 안에서 한 번 더 확인된다.** 배정 없음 → `NOT_FOUND`(다른 반·다른 과목·`기타`·지난 학기 배정·학생 호출 모두).
- 성능: 집계는 이번 주 세션만 읽는다. `sessions(student_id, started_at)` 인덱스가 있으면 충분하다고 본다. 느리면 알려 주세요.
- 알림(메일·푸시), 지난주 비교, 해설 링크는 없다.

---

## G. 거부 테스트 (높음)

프론트 mock 통합 테스트와 같은 시나리오. 교과 교사 T는 `3반 수학` 현재 학기 배정만 있고 `classId`(담임 반)는 없다.

| # | 상황 | 호출 | 기대 결과 |
|---|---|---|---|
| 1 | **다른 과목**: 같은 반 학생의 `영어` 세션 | T가 `v_sessions`·`v_entries`·`v_reflections`·`v_quiz_attempts`·`v_session_topics`·`v_feedback` 조회 (세션 id 직접 지정 포함) | **0행** |
| 2 | **다른 반**: 5반 학생의 `수학` 세션 (T는 5반 배정 없음) | 같은 조회, `subject_week_summary(5반, 수학)`, `subject_students(5반, 수학)`, `log_student_view(5반 학생, 수학)` | view **0행**, RPC `NOT_FOUND` |
| 3 | **미동의**: 3반 학생이 `SUBJECT_SHARE` 없음 | 같은 조회 | **0행**. `subject_students`에 그 학생 없음, 요약에 안 들어감 |
| 3-b | 학생이 `LEARNING_RECORD`를 끄고 `SUBJECT_SHARE`만 남김 | 같은 조회 | **0행** (함수가 `LEARNING_RECORD`를 같이 봄) |
| 4 | **지난 학기**: 지난 학기에 시작한 3반 수학 세션, 또는 배정 `term`이 지난 학기 | 같은 조회, RPC | view **0행**, RPC `NOT_FOUND`(배정이 지난 학기뿐일 때) |
| 5 | `기타` 과목 세션, 배정 `subject='기타'` 삽입 시도 | 조회 / insert | **0행** / check 제약 위반 |
| 6 | 정상: 3반 수학·두 동의·현재 학기 | T가 조회 | 해당 세션만 보임. `entries`는 `TEACHER`만 (`PRIVATE` 0행) |
| 7 | AI 대화 | T가 `ai_messages` 조회 | **0행** (6번 정상 학생도) |
| 8 | 피드백 | T가 3반 수학 세션에 insert, 클라이언트가 `author_subject='국어'`·`teacher_id` 다른 값을 넣음 | 성공, 저장값은 `author_subject='수학'`, `teacher_id = T`. 다른 과목·다른 반 세션에 insert → 거부(RLS) |
| 9 | 담임 겸 교과 교사 H (3반 담임, 5반 영어 배정) | 3반 학생(영어 포함 전 과목·AI 대화), 5반 학생 영어만 | 3반은 담임 범위 전체, 5반은 영어 세션만. 5반 수학·5반 AI 대화는 0행 |
| 10 | 열람 기록 | T가 `log_student_view(학생, '수학')` → 학생이 `v_audit_logs` 조회 | 행 1개, `subject='수학'`. 과목 없이 호출 → `NOT_FOUND` |
| 11 | 주 경계 | 일요일 23:59 KST 세션과 월요일 00:00 KST 세션 (UTC로 일 14:59, 월 15:00 전날) | 요약의 `weekStart`와 `sessionCount`가 서울 기준 주로 나뉨 |
| 12 | 적음 | 이번 주 학습 학생 2명 | `few=true`, `sessionCount=0`, `topics=[]`, `hardQuestions=[]`, `studentCount="적음"`. 3명이면 `few=false`. 응시 학생 2명인 주제의 `lastRate=null` |
| 13 | 학생·타 교사 | 학생이 `subject_week_summary` 호출, 배정 없는 교사 호출 | `NOT_FOUND` |

기대 결과가 "0행"인 곳은 에러가 아니라 빈 결과다(존재를 숨김). 프론트는 빈 결과를 "볼 수 있는 기록이 없어요"로 처리한다.

## H. 프론트 플래그 켜는 조건

지금 `frontend/src/api/index.ts`의 `FEATURES.subjectTeacher`는 `USE_MOCK`이다(실제 모드에서는 꺼져 있어 동의 화면의 교과 공유 항목과 교과 교사 메뉴가 안 보인다). 아래를 모두 만족하면 프론트가 실제 모드에서도 켠다.

1. A~F 배포 완료, G의 1~13 통과 결과를 프론트에 공유.
2. `sessions.subject` 컬럼(C-0)과 `startSession`의 `subject` 전송이 반영됨.
3. 실제 모드 클라이언트(`frontend/src/api/supabaseApi.ts`)가 위 이름으로 연결된다: `listMyAssignments` → `v_my_assignments`, `getSubjectSummary` → `rpc subject_week_summary`, `listSubjectStudents` → `rpc subject_students`, `logStudentView(studentId, subject)` → `rpc log_student_view`. (프론트 작업, 백엔드 배포 후 진행)
4. 시드: 교과 교사 계정 1명 이상(담임 아님, `class_id` 없음), 현재 학기 배정, `SUBJECT_SHARE` 동의 학생 3명 이상(요약이 "적음"으로만 나오지 않게).
5. 만 14세 미만 보호자 동의 질문의 결론(B).

## 이 요청에서 확인되지 않은 것 (프론트가 가정한 것)

- (해결) 교과만 맡은 교사는 DB `profiles.class_id`가 NULL이다. 프론트가 NULL을 `""`로 바꿔 `User.classId`(string)에 넣는다. 백엔드는 NULL 그대로 두면 된다. 정책·함수는 `class_id is not null` 조건으로 NULL을 어떤 반과도 맞지 않게 처리한다(위 SQL).
- `app_role()`, `owns_session()`, `teaches_shared_session()`, `shares_record()`, `teaches_student()`, `users.number`·`users.name`, `reflections.understanding`, `quiz_attempts.items`의 `questionId`·`prompt`·`correct`·`reported` 키는 v0.5 요청서와 프론트 타입 기준이다. 다르면 알려 주세요.
- 한국어 이름 정렬: 프론트는 `localeCompare("ko")`. DB 정렬 규칙(`"ko-KR-x-icu"`)이 없으면 `name` 정렬 순서가 조금 다를 수 있다(같은 `reviewCount`·학습 학생 수일 때만 영향).

질문이나 다르게 하고 싶은 부분은 프론트에 알려 주세요.
