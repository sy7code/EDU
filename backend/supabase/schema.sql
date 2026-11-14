-- 성장 페이스 스키마 (프로토타입)
-- 다시 실행하면 우리 테이블을 지우고 새로 만든다 (데모 DB 전용, 이후 seed.sql 재실행).
-- ponytail: 데모용 전체 재생성. 실데이터가 생기면 migration 파일 방식으로 전환

create extension if not exists pgcrypto;

drop table if exists qr_tokens, qr_scans, question_themes, question_theme_calls, teacher_assignments, audit_logs, ai_calls, quiz_question_reviews, quiz_reports, quiz_attempts, quiz_serves, topic_questions, session_topics, topics,
  consents, feedback, reflections, ai_messages, entries, sessions, auth_events, devices, users, classes cascade;
drop function if exists app_role, app_class, owns_session, teaches_student, teaches_session,
  shares_record, teaches_shared_session, entries_require_active, reflections_touch, consents_guardian_check, feedback_read_at,
  class_dashboard, student_topic_growth, class_reported_questions, log_student_view, take_ai_slot,
  current_term, subject_share_active, teaches_subject, teaches_subject_session, has_assignment, feedback_set_author,
  subject_week_sessions, subject_students, subject_week_summary,
  ai_consent_active, take_theme_slot, question_theme_inputs, question_themes, issue_qr_token, scan_qr_token cascade;

-- ───────────── 테이블 ─────────────

create table classes (
  id uuid primary key default gen_random_uuid(),
  name text not null
);

create table users (
  id uuid primary key,                       -- auth.users.id (로그인 없는 시드 학생은 임의 UUID)
  name text not null,
  role text not null check (role in ('student','teacher')),
  class_id uuid references classes(id),
  number int,
  facepass_key text unique,                  -- 토스 FacePass merchantUserKey (비식별 시리얼)
  under14 boolean not null default false     -- 만 14세 미만 → 동의는 보호자 동의(by_guardian)만 유효
);

create table devices (
  id text primary key,                       -- 'kiosk-study-room-1'
  class_id uuid references classes(id),
  token_hash text unique,                    -- 기기 토큰 SHA-256 (원문은 저장 안 함)
  revoked_at timestamptz
);

create table auth_events (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references users(id) on delete cascade,
  device_id text not null references devices(id),
  method text not null check (method in ('FACEPASS','QR','MANUAL')),
  success boolean not null,
  verified_at timestamptz not null default now(),
  consumed_at timestamptz
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references users(id) on delete cascade,
  goal text not null check (char_length(goal) between 1 and 200),
  started_at timestamptz not null,
  ended_at timestamptz,
  start_auth text not null,
  end_auth text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','ENDED')),
  summary jsonb
);
create unique index one_active_session_per_student on sessions(student_id) where status = 'ACTIVE';

create table entries (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  kind text not null check (kind in ('MEMO','QUESTION','QUIZ','PAPER')),   -- PAPER: "종이에 기록했어요"
  content text not null default '' check (char_length(content) <= 2000 and (kind = 'PAPER' or char_length(content) >= 1)),
  visibility text not null default 'TEACHER' check (visibility in ('TEACHER','PRIVATE')),
  created_at timestamptz not null default now()
);

create table ai_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  role text not null check (role in ('student','ai')),
  content text not null,
  -- 학생 메시지만: CONCEPT 개념 이해 / CHECK 풀이 확인 / ANSWER 답 요청 / OTHER (겹치면 ANSWER > CHECK > CONCEPT)
  question_type text check (question_type is null or (question_type in ('CONCEPT','CHECK','ANSWER','OTHER') and role = 'student')),
  created_at timestamptz not null default now()
);

create table reflections (
  session_id uuid primary key references sessions(id) on delete cascade,
  changed text not null default '' check (char_length(changed) <= 2000),
  checks text[] not null default '{}',                                   -- 체크리스트 항목
  understanding int check (understanding between 1 and 3),               -- 이해도 1~3
  note text check (char_length(note) <= 500),
  remaining_questions text[] not null default '{}',
  updated_at timestamptz not null default now()
);

-- 동의 이력 (종류별 최신 행이 현재 값, unique 두지 않음)
create table consents (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references users(id) on delete cascade,
  kind text not null check (kind in ('FACEPASS','AI','LEARNING_RECORD')),
  granted boolean not null,
  by_guardian boolean not null default false,
  policy_version text not null,
  created_at timestamptz not null default now()
);

create table feedback (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  teacher_id uuid not null references users(id),
  content text not null check (char_length(content) between 1 and 2000),
  read_at timestamptz,                       -- 학생이 열어 본 시각 (null = 새 피드백)
  created_at timestamptz not null default now()
);

-- ───────────── 권한 헬퍼 (users 기준, JWT metadata 안 씀) ─────────────
-- security definer: 정책 안에서 users/sessions를 다시 조회할 때 RLS 재귀를 피한다.

create function app_role() returns text
language sql stable security definer set search_path = public as $$
  select role from users where id = auth.uid()
$$;

create function app_class() returns uuid
language sql stable security definer set search_path = public as $$
  select class_id from users where id = auth.uid()
$$;

create function owns_session(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from sessions where id = sid and student_id = auth.uid())
$$;

create function teaches_student(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select app_role() = 'teacher'
     and exists (select 1 from users where id = uid and class_id = app_class())
$$;

create function teaches_session(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from sessions where id = sid and teaches_student(student_id))
$$;

-- 학습 기록 공유 동의 (최신 LEARNING_RECORD 행 기준)
-- ponytail: 동의 기록이 없으면 공유로 간주(시드 호환). 운영에선 coalesce 기본값을 false로
create function shares_record(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select granted from consents where student_id = uid and kind = 'LEARNING_RECORD'
                   order by created_at desc limit 1), true)
$$;

create function teaches_shared_session(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from sessions where id = sid and teaches_student(student_id) and shares_record(student_id))
$$;

-- ───────────── RLS (기본 거부, 필요한 것만 허용) ─────────────

alter table classes     enable row level security;
alter table users       enable row level security;
alter table devices     enable row level security;
alter table auth_events enable row level security;
alter table sessions    enable row level security;
alter table entries     enable row level security;
alter table ai_messages enable row level security;
alter table reflections enable row level security;
alter table feedback    enable row level security;
alter table consents    enable row level security;

create policy consents_read on consents for select using (student_id = auth.uid() or teaches_student(student_id));
create policy consents_insert on consents for insert with check (student_id = auth.uid());

create policy classes_read on classes for select using (id = app_class());

create policy users_read on users for select
  using (id = auth.uid() or teaches_student(id));

-- devices, auth_events: 정책 없음 → 서버 함수(service_role)만 접근

create policy sessions_read on sessions for select
  using (student_id = auth.uid() or teaches_student(student_id));

-- 교사는 "TEACHER 공개 + 학생이 기록 공유에 동의"한 것만
create policy entries_read on entries for select
  using (owns_session(session_id) or (visibility = 'TEACHER' and teaches_shared_session(session_id)));
create policy entries_insert on entries for insert
  with check (owns_session(session_id));

create policy ai_messages_read on ai_messages for select
  using (owns_session(session_id) or teaches_shared_session(session_id));

create policy reflections_read on reflections for select
  using (owns_session(session_id) or teaches_shared_session(session_id));
create policy reflections_insert on reflections for insert
  with check (owns_session(session_id));
create policy reflections_update on reflections for update
  using (owns_session(session_id)) with check (owns_session(session_id));

create policy feedback_read on feedback for select
  using (owns_session(session_id) or teaches_session(session_id));
create policy feedback_insert on feedback for insert
  with check (teacher_id = auth.uid() and teaches_session(session_id));
-- 학생은 자기 세션 피드백의 read_at만 바꿀 수 있음 (컬럼 권한은 아래 grant update (read_at))
create policy feedback_mark_read on feedback for update
  using (owns_session(session_id)) with check (owns_session(session_id));

-- ACTIVE 세션에만 기록 추가
create function entries_require_active() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from sessions where id = new.session_id and status = 'ACTIVE') then
    raise sqlstate 'PGRST' using message = '{"code":"SESSION_NOT_ACTIVE","message":"진행 중인 학습에만 기록할 수 있어요."}', detail = '{"status":409,"headers":{}}';
  end if;
  return new;
end $$;
create trigger entries_active before insert on entries
  for each row execute function entries_require_active();

create function reflections_touch() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger reflections_updated before update on reflections
  for each row execute function reflections_touch();

-- 피드백 읽은 시각은 서버 시각, 한 번 읽으면 바뀌지 않음 (학생 기기 시계 무관)
create function feedback_read_at() returns trigger
language plpgsql as $$
begin
  new.read_at := case when old.read_at is not null then old.read_at
                      when new.read_at is not null then now() end;
  return new;
end $$;
create trigger feedback_read_at before update on feedback
  for each row execute function feedback_read_at();

-- 만 14세 미만은 보호자 동의 없이 '동의함'을 저장할 수 없음 (거부·철회는 본인도 가능)
-- ponytail: by_guardian은 자기 신고값. 실제 보호자 인증(휴대폰 본인확인 등)은 운영 단계 과제
create function consents_guardian_check() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.granted and not new.by_guardian and (select under14 from users where id = new.student_id) then
    raise sqlstate 'PGRST' using
      message = '{"code":"GUARDIAN_CONSENT_REQUIRED","message":"만 14세 미만은 보호자 동의가 필요해요."}',
      detail = '{"status":403,"headers":{}}';
  end if;
  return new;
end $$;
create trigger consents_guardian before insert on consents
  for each row execute function consents_guardian_check();

-- ───────────── camelCase view (프론트 직접 조회용, RLS 그대로 적용) ─────────────

create view v_me with (security_invoker = true) as
  select id, name, role, class_id as "classId", number, under14 from users where id = auth.uid();

create view v_students with (security_invoker = true) as
  select id, name, class_id as "classId", number from users where role = 'student';

create view v_sessions with (security_invoker = true) as
  select id, student_id as "studentId", goal, started_at as "startedAt", ended_at as "endedAt",
         start_auth as "startAuth", end_auth as "endAuth", status,
         case when ended_at is null then null
              else round(extract(epoch from ended_at - started_at) / 60)::int end as "durationMinutes",
         summary
  from sessions;

create view v_entries with (security_invoker = true) as
  select id, session_id as "sessionId", kind, content, visibility, created_at as "createdAt" from entries;

create view v_ai_messages with (security_invoker = true) as
  select id, session_id as "sessionId", role, content, question_type as "questionType",
         created_at as "createdAt" from ai_messages;

create view v_reflections with (security_invoker = true) as
  select session_id as "sessionId", changed, checks, understanding, note,
         remaining_questions as "remainingQuestions", updated_at as "updatedAt" from reflections;

create view v_consents with (security_invoker = true) as
  select id, student_id as "studentId", kind, granted, by_guardian as "byGuardian",
         policy_version as "policyVersion", created_at as "createdAt" from consents;

create view v_feedback with (security_invoker = true) as
  select id, session_id as "sessionId", teacher_id as "teacherId", content, read_at as "readAt",
         created_at as "createdAt"
  from feedback;

-- ───────────── 교사 반 대시보드 (F9) ─────────────

create function class_dashboard(p_class_id uuid, p_from date, p_to date) returns json
language plpgsql stable security invoker set search_path = public as $$
declare
  range_start timestamptz := p_from::timestamp at time zone 'Asia/Seoul';
  range_end   timestamptz := (p_to + 1)::timestamp at time zone 'Asia/Seoul';
begin
  if app_role() is distinct from 'teacher' or app_class() is distinct from p_class_id then
    raise sqlstate 'PGRST' using message = '{"code":"NOT_FOUND","message":"찾을 수 없어요."}', detail = '{"status":404,"headers":{}}';
  end if;

  return json_build_object(
    'classId', p_class_id, 'from', p_from, 'to', p_to,
    'students', coalesce((
      select json_agg(row_to_json(x) order by x.number)
      from (
        select u.id as "studentId", u.name, u.number,
               count(s.id)::int as "sessionCount",
               coalesce(sum(round(extract(epoch from s.ended_at - s.started_at) / 60)), 0)::int as "totalMinutes",
               coalesce(sum(cardinality(r.remaining_questions)), 0)::int as "openQuestionCount",
               (select max(started_at) from sessions where student_id = u.id) as "lastSessionAt",
               coalesce(bool_or(r.session_id is not null
                        and not exists (select 1 from feedback f where f.session_id = s.id)), false)
                 as "hasReflectionWithoutFeedback",
               shares_record(u.id) as shared,                -- 기록 공유 동의 (기록 없으면 true)
               -- 최근 응시 정답률 (total>0만). quiz_attempts RLS로 기록 공유 미동의 학생은 null
               (select round(a.correct::numeric / a.total, 2) from quiz_attempts a
                where a.student_id = u.id and a.total > 0 order by a.created_at desc limit 1) as "lastQuizRate",
               (coalesce(sum(cardinality(r.remaining_questions)), 0) >= 3
                or not exists (select 1 from sessions
                               where student_id = u.id and started_at >= now() - interval '7 days'))
                 as "needsAttention"
        from users u
        left join sessions s on s.student_id = u.id and s.started_at >= range_start and s.started_at < range_end
        left join reflections r on r.session_id = s.id
        where u.role = 'student' and u.class_id = p_class_id
        group by u.id, u.name, u.number
      ) x
    ), '[]'::json)
  );
end $$;

-- ───────────── 주제별 성장 + 객관적 테스트 (명세 v0.5) ─────────────
-- 쓰기는 전부 함수(service_role). 정답이 든 문항 풀·출제 스냅샷·신고는 정책 없음 → 학생 직접 조회 불가

create table topics (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  subject text,
  created_at timestamptz not null default now(),
  unique (class_id, name)
);

create table session_topics (
  session_id uuid not null references sessions(id) on delete cascade,
  topic_id uuid not null references topics(id) on delete cascade,
  evidence_ids text[] not null check (cardinality(evidence_ids) >= 1),   -- 교사 공개 entry id만 (목표는 근거 아님)
  primary key (session_id, topic_id)
);

create table topic_questions (                 -- 반 단위 문항 풀 (정답 포함)
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references topics(id) on delete cascade,
  type text not null check (type in ('MCQ','OX')),
  level text not null check (level in ('CONCEPT','APPLY')),
  prompt text not null check (char_length(prompt) <= 300),
  choices text[] not null,
  answer_index int not null,
  explanation text not null default '' check (char_length(explanation) <= 500),
  excluded boolean not null default false,
  created_at timestamptz not null default now()
);

create table quiz_serves (                     -- 세션별 출제 스냅샷 (섞인 선택지 + 보정된 정답)
  session_id uuid primary key references sessions(id) on delete cascade,
  topic_id uuid not null references topics(id) on delete cascade,
  questions jsonb not null,
  created_at timestamptz not null default now()
);

create table quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references sessions(id) on delete cascade,   -- 세션당 1회
  topic_id uuid not null references topics(id) on delete cascade,
  student_id uuid not null references users(id) on delete cascade,
  correct int not null,
  total int not null,                          -- 신고 문항 제외
  items jsonb not null,
  created_at timestamptz not null default now()
);

create table quiz_reports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  question_id uuid not null references topic_questions(id) on delete cascade,
  student_id uuid not null references users(id) on delete cascade,
  reason text not null check (reason in ('WRONG_ANSWER','UNCLEAR','UNRELATED')),
  status text not null default 'OPEN' check (status in ('OPEN','KEEP_EXCLUDED','DISMISSED','AI_CLEARED')),
  ai_review jsonb,                             -- 이 신고에 대한 AI 1차 검토 { verdict, reason } (첫 신고만)
  resolved_by uuid references users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (session_id, question_id)
);

alter table topics          enable row level security;
alter table session_topics  enable row level security;
alter table topic_questions enable row level security;
alter table quiz_serves     enable row level security;
alter table quiz_attempts   enable row level security;
alter table quiz_reports    enable row level security;

-- 반·문항별 첫 신고 표시: PK로 "첫 신고"를 원자적으로 판정 → AI 검토는 반·문항당 한 번
create table quiz_question_reviews (
  class_id uuid not null references classes(id) on delete cascade,
  question_id uuid not null references topic_questions(id) on delete cascade,
  verdict text check (verdict in ('OK','ERROR')),   -- AI 결과 전·실패 시 null
  reason text,
  created_at timestamptz not null default now(),
  primary key (class_id, question_id)
);
alter table quiz_question_reviews enable row level security;   -- 정책 없음: 함수(service_role)만

create policy topics_read on topics for select using (class_id = app_class());
create policy session_topics_read on session_topics for select
  using (owns_session(session_id) or teaches_shared_session(session_id));
create policy quiz_attempts_read on quiz_attempts for select
  using (owns_session(session_id) or teaches_shared_session(session_id));

create view v_topics with (security_invoker = true) as
  select id, class_id as "classId", name, subject from topics;

create view v_session_topics with (security_invoker = true) as
  select st.session_id as "sessionId", st.topic_id as "topicId", t.name, t.subject, st.evidence_ids as "evidenceIds"
  from session_topics st join topics t on t.id = st.topic_id;

create view v_quiz_attempts with (security_invoker = true) as
  select id, session_id as "sessionId", topic_id as "topicId", student_id as "studentId",
         correct, total, items, created_at as "createdAt" from quiz_attempts;

-- 주제별 성장. 교사가 볼 때 기록 공유 미동의면 횟수·시간만 (정답률·이해도·신호 null)
-- security definer: 미동의 학생도 횟수는 보여야 해서 RLS 대신 아래에서 권한 직접 검사
create function student_topic_growth(p_student_id uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  is_shared boolean;
begin
  if not (auth.uid() = p_student_id or teaches_student(p_student_id)) then
    raise sqlstate 'PGRST' using message = '{"code":"NOT_FOUND","message":"찾을 수 없어요."}', detail = '{"status":404,"headers":{}}';
  end if;
  is_shared := auth.uid() = p_student_id or shares_record(p_student_id);

  return json_build_object('shared', is_shared, 'topics', coalesce((
    select json_agg(row_to_json(g) order by g.sessions desc, g.name)
    from (
      select t.id as "topicId", t.name, t.subject,
             count(distinct s.id)::int as sessions,
             coalesce(sum(distinct_minutes.m), 0)::int as minutes,
             (select count(*) from quiz_attempts a where a.student_id = p_student_id and a.topic_id = t.id)::int as attempts,
             case when is_shared then first_last.first_rate end as "firstRate",
             case when is_shared then first_last.last_rate end as "lastRate",
             case when is_shared then last_r.understanding end as "lastUnderstanding",
             case when is_shared then first_last.last_total end as "lastTotal",
             -- 채점 문항 3개 미만(대부분 신고)이면 신호를 띄우지 않음
             case when not is_shared or first_last.last_rate is null or first_last.last_total < 3 then null
                  when last_pair.understanding = 3 and first_last.last_rate < 0.6 then 'OVERCONFIDENT'
                  when first_last.last_rate < 0.4 then 'LOW_SCORE' end as signal
      from topics t
      join session_topics st on st.topic_id = t.id
      join sessions s on s.id = st.session_id and s.student_id = p_student_id
      left join lateral (select round(extract(epoch from s.ended_at - s.started_at) / 60) as m) distinct_minutes on true
      left join lateral (
        select (select round(a.correct::numeric / a.total, 2) from quiz_attempts a
                where a.student_id = p_student_id and a.topic_id = t.id and a.total > 0 order by a.created_at limit 1) as first_rate,
               (select round(a.correct::numeric / a.total, 2) from quiz_attempts a
                where a.student_id = p_student_id and a.topic_id = t.id and a.total > 0 order by a.created_at desc limit 1) as last_rate,
               (select a.total from quiz_attempts a
                where a.student_id = p_student_id and a.topic_id = t.id and a.total > 0 order by a.created_at desc limit 1) as last_total
      ) first_last on true
      left join lateral (                      -- 이 주제 세션 중 가장 최근 성찰 이해도
        select r.understanding from reflections r join session_topics st2 on st2.session_id = r.session_id
        join sessions s2 on s2.id = r.session_id
        where st2.topic_id = t.id and s2.student_id = p_student_id and r.understanding is not null
        order by s2.started_at desc limit 1
      ) last_r on true
      left join lateral (                      -- 신호: 최근 응시와 "같은 세션"의 이해도
        select r.understanding from quiz_attempts a join reflections r on r.session_id = a.session_id
        where a.student_id = p_student_id and a.topic_id = t.id and a.total > 0
        order by a.created_at desc limit 1
      ) last_pair on true
      group by t.id, t.name, t.subject, first_last.first_rate, first_last.last_rate, first_last.last_total,
               last_r.understanding, last_pair.understanding
    ) g
  ), '[]'::json));
end $$;

-- 교사: 자기 반 신고 문항 (정답·해설 포함, 학생별 신고 수로 남발 판단)
create function class_reported_questions(p_class_id uuid) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if app_role() is distinct from 'teacher' or app_class() is distinct from p_class_id then
    raise sqlstate 'PGRST' using message = '{"code":"NOT_FOUND","message":"찾을 수 없어요."}', detail = '{"status":404,"headers":{}}';
  end if;
  return coalesce((
    select json_agg(json_build_object(
      'reportId', r.id, 'topicName', t.name, 'prompt', q.prompt, 'choices', q.choices,
      'answerIndex', q.answer_index, 'explanation', q.explanation, 'reason', r.reason,
      -- 재신고 행에도 그 문항 첫 신고의 AI 검토를 보여 줌
      'aiReview', (select case when v.verdict is null then null
                               else json_build_object('verdict', v.verdict, 'reason', v.reason) end
                   from quiz_question_reviews v where v.class_id = p_class_id and v.question_id = r.question_id),
      'questionReportCount', (select count(*) from quiz_reports r3 join users u3 on u3.id = r3.student_id
                              where r3.question_id = r.question_id and u3.class_id = p_class_id),
      -- 기록 공유 미동의 학생은 누가 신고했는지 숨김
      'studentNumber', case when shares_record(r.student_id) then u.number end,
      'studentReportCount', case when shares_record(r.student_id)
                                 then (select count(*) from quiz_reports r2 where r2.student_id = r.student_id) end,
      'createdAt', r.created_at, 'status', r.status) order by r.created_at desc)
    from quiz_reports r
    join topic_questions q on q.id = r.question_id
    join topics t on t.id = q.topic_id
    join users u on u.id = r.student_id
    where t.class_id = p_class_id
  ), '[]'::json);
end $$;

-- ───────────── 교사 열람 기록 (투명성) ─────────────
-- 교사가 학생 상세를 열 때 프론트가 log_student_view 호출. 학생은 누가 언제 봤는지 확인 가능
create table audit_logs (
  id bigserial primary key,
  actor_id uuid not null references users(id) on delete cascade,
  actor_name text not null,
  action text not null check (action in ('VIEW_STUDENT_DETAIL')),
  target_student_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table audit_logs enable row level security;
create policy audit_logs_read on audit_logs for select
  using (actor_id = auth.uid() or target_student_id = auth.uid());

create function log_student_view(p_student_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not teaches_student(p_student_id) then
    raise sqlstate 'PGRST' using message = '{"code":"NOT_FOUND","message":"찾을 수 없어요."}', detail = '{"status":404,"headers":{}}';
  end if;
  insert into audit_logs (actor_id, actor_name, action, target_student_id)
    values (auth.uid(), (select name from users where id = auth.uid()), 'VIEW_STUDENT_DETAIL', p_student_id);
end $$;

create view v_audit_logs with (security_invoker = true) as
  select id, actor_id as "actorId", actor_name as "actorName", action,
         target_student_id as "studentId", created_at as "createdAt" from audit_logs;

-- ───────────── AI 호출 제한 (원자적) ─────────────
-- 학생별 advisory lock 안에서 세고 기록 → 동시 요청도 분당 10회·하루 200회를 넘지 못함. 서버 함수만 호출
create table ai_calls (
  student_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index ai_calls_recent on ai_calls (student_id, created_at);
alter table ai_calls enable row level security;

create function take_ai_slot(p_student_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext(p_student_id::text));
  if (select count(*) from ai_calls where student_id = p_student_id and created_at > now() - interval '1 minute') >= 10
     or (select count(*) from ai_calls where student_id = p_student_id and created_at > now() - interval '1 day') >= 200 then
    return false;
  end if;
  insert into ai_calls (student_id) values (p_student_id);
  return true;
end $$;

-- 휴대폰에서 올린 기록이 PC 화면에 바로 보이도록 entries Realtime (postgres_changes, RLS 적용)
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'entries') then
    alter publication supabase_realtime add table entries;
  end if;
end $$;

-- ───────────── 노출 권한 ─────────────
-- 원본 테이블은 RLS로 보호. anon(비로그인)은 아무것도 못 읽게 view·RPC 권한을 authenticated로 한정.

revoke all on all tables in schema public from anon;
grant select on v_me, v_students, v_sessions, v_entries, v_ai_messages, v_reflections, v_feedback, v_consents to authenticated;
grant insert on entries, feedback, consents to authenticated;
grant insert, update on reflections to authenticated;
revoke update on feedback from authenticated;
grant update (read_at) on feedback to authenticated;
grant select on v_audit_logs to authenticated;
revoke execute on function log_student_view(uuid), take_ai_slot(uuid) from public, anon, authenticated;
grant execute on function log_student_view(uuid) to authenticated;
grant select on v_topics, v_session_topics, v_quiz_attempts to authenticated;
revoke execute on function class_dashboard(uuid, date, date), student_topic_growth(uuid),
  class_reported_questions(uuid) from public, anon;
grant execute on function class_dashboard(uuid, date, date), student_topic_growth(uuid),
  class_reported_questions(uuid) to authenticated;

-- ───────────── v0.9 교과 교사 (migrations/2026-11-14_v0.9.sql 과 같음) ─────────────

-- A. 배정·현재 학기
create table if not exists teacher_assignments (
  teacher_id uuid not null references users(id) on delete cascade,
  class_id   uuid not null references classes(id) on delete cascade,
  subject    text not null check (subject in ('국어','수학','영어','사회','과학')),
  term       text not null check (term ~ '^[0-9]{4}-[12]$'),
  created_at timestamptz not null default now(),
  primary key (teacher_id, class_id, subject, term)
);
alter table teacher_assignments enable row level security;
drop policy if exists teacher_assignments_read on teacher_assignments;
create policy teacher_assignments_read on teacher_assignments for select using (teacher_id = auth.uid());

-- 서울 날짜 기준: 3~8월 YYYY-1, 9~12월 YYYY-2, 1~2월 (YYYY-1)-2
create or replace function current_term(ts timestamptz default now()) returns text
language sql stable as $$
  select case
    when extract(month from ts at time zone 'Asia/Seoul') between 3 and 8 then extract(year from ts at time zone 'Asia/Seoul')::int || '-1'
    when extract(month from ts at time zone 'Asia/Seoul') >= 9 then extract(year from ts at time zone 'Asia/Seoul')::int || '-2'
    else (extract(year from ts at time zone 'Asia/Seoul')::int - 1) || '-2'
  end
$$;

create or replace view v_my_assignments with (security_invoker = true) as
  select teacher_id as "teacherId", class_id as "classId", subject, term
  from teacher_assignments where teacher_id = auth.uid() and term = current_term();

-- B. 과목 공유 동의 (행 없으면 false, 학습 기록 공유가 꺼지면 무조건 false)
alter table consents drop constraint if exists consents_kind_check;
alter table consents add constraint consents_kind_check check (kind in ('FACEPASS','AI','LEARNING_RECORD','SUBJECT_SHARE'));

create or replace function subject_share_active(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select shares_record(sid)
     and coalesce((select granted from consents where student_id = sid and kind = 'SUBJECT_SHARE'
                   order by created_at desc limit 1), false)
$$;

-- C-0. 세션 과목 (시작 때 서버가 저장. 학생·교사 모두 sessions update 권한 없음 → 변경 불가)
alter table sessions add column if not exists subject text not null default '기타';
alter table sessions add column if not exists subject_summary jsonb;   -- 교과 교사용 요약 (AI 대화 제외)
alter table sessions drop constraint if exists sessions_subject_check;
alter table sessions add constraint sessions_subject_check check (subject in ('국어','수학','영어','사회','과학','기타'));
-- 기존 행 1회 백필: goal 첫 칸 → 없으면 세션 주제의 과목(화학→과학, 한국사→사회) → 없으면 기타
update sessions s set subject = coalesce(
  nullif(case when split_part(s.goal, ' | ', 1) in ('국어','수학','영어','사회','과학') then split_part(s.goal, ' | ', 1) end, ''),
  (select case t.subject when '화학' then '과학' when '물리' then '과학' when '생명과학' then '과학' when '지구과학' then '과학'
                         when '한국사' then '사회' else t.subject end
     from session_topics st join topics t on t.id = st.topic_id
    where st.session_id = s.id
      and (case t.subject when '화학' then '과학' when '물리' then '과학' when '생명과학' then '과학' when '지구과학' then '과학'
                          when '한국사' then '사회' else t.subject end) in ('국어','수학','영어','사회','과학')
    limit 1),
  '기타')
where s.subject = '기타';

-- C. 교과 교사 열람 조건
create or replace function teaches_subject(sid uuid, subj text, started timestamptz) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(app_role() = 'teacher'
     and subj in ('국어','수학','영어','사회','과학')
     and started is not null
     and current_term(started) = current_term()
     and subject_share_active(sid)
     and exists (select 1 from users st join teacher_assignments ta on ta.class_id = st.class_id
                 where st.id = sid and st.role = 'student'
                   and ta.teacher_id = auth.uid() and ta.subject = subj and ta.term = current_term()), false)
$$;

create or replace function teaches_subject_session(sess uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from sessions s where s.id = sess and teaches_subject(s.student_id, s.subject, s.started_at))
$$;

create or replace function has_assignment(p_class_id uuid, p_subject text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(app_role() = 'teacher' and p_subject in ('국어','수학','영어','사회','과학')
     and exists (select 1 from teacher_assignments where teacher_id = auth.uid() and class_id = p_class_id
                   and subject = p_subject and term = current_term()), false)
$$;

drop policy if exists sessions_read on sessions;
create policy sessions_read on sessions for select
  using (student_id = auth.uid() or teaches_student(student_id) or teaches_subject(student_id, subject, started_at));
drop policy if exists entries_read on entries;
create policy entries_read on entries for select
  using (owns_session(session_id)
         or (visibility = 'TEACHER' and (teaches_shared_session(session_id) or teaches_subject_session(session_id))));
drop policy if exists reflections_read on reflections;
create policy reflections_read on reflections for select
  using (owns_session(session_id) or teaches_shared_session(session_id) or teaches_subject_session(session_id));
drop policy if exists session_topics_read on session_topics;
create policy session_topics_read on session_topics for select
  using (owns_session(session_id) or teaches_shared_session(session_id) or teaches_subject_session(session_id));
drop policy if exists quiz_attempts_read on quiz_attempts;
create policy quiz_attempts_read on quiz_attempts for select
  using (owns_session(session_id) or teaches_shared_session(session_id) or teaches_subject_session(session_id));
-- 배정된 반의 주제 이름·반 이름은 교과 교사도 읽음 (v_session_topics가 topics를 join)
drop policy if exists topics_read on topics;
create policy topics_read on topics for select
  using (class_id = app_class()
         or exists (select 1 from teacher_assignments where teacher_id = auth.uid() and class_id = topics.class_id and term = current_term()));
drop policy if exists classes_read on classes;
create policy classes_read on classes for select
  using (id = app_class()
         or exists (select 1 from teacher_assignments where teacher_id = auth.uid() and class_id = classes.id and term = current_term()));
-- ai_messages_read 는 그대로 (교과 교사 0행)

-- D. 피드백: 교과 교사 쓰기 + 작성 과목 서버 채움 (수정은 read_at 컬럼 권한만 있어 바꿀 수 없음)
alter table feedback add column if not exists author_subject text;
alter table feedback drop constraint if exists feedback_author_subject_check;
alter table feedback add constraint feedback_author_subject_check
  check (author_subject is null or author_subject in ('국어','수학','영어','사회','과학'));

drop policy if exists feedback_read on feedback;
create policy feedback_read on feedback for select
  using (owns_session(session_id) or teaches_session(session_id) or teaches_subject_session(session_id));
drop policy if exists feedback_insert on feedback;
create policy feedback_insert on feedback for insert
  with check (teacher_id = auth.uid() and (teaches_session(session_id) or teaches_subject_session(session_id)));

create or replace function feedback_set_author() returns trigger
language plpgsql security definer set search_path = public as $$
declare s sessions%rowtype;
begin
  if auth.uid() is null then return new; end if;              -- 시드·service_role
  select * into s from sessions where id = new.session_id;
  new.teacher_id := auth.uid();
  new.author_subject := case when teaches_student(s.student_id) then null
                             when s.subject in ('국어','수학','영어','사회','과학') then s.subject end;
  return new;
end $$;
drop trigger if exists feedback_author on feedback;
create trigger feedback_author before insert on feedback
  for each row execute function feedback_set_author();

-- E. 열람 기록 과목
alter table audit_logs add column if not exists subject text;
drop function if exists log_student_view(uuid);
create or replace function log_student_view(p_student_id uuid, p_subject text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_subject text;
begin
  if teaches_student(p_student_id) then
    v_subject := null;
  elsif p_subject is not null and has_assignment((select class_id from users where id = p_student_id and role = 'student'), p_subject)
        and subject_share_active(p_student_id) then
    v_subject := p_subject;
  else
    raise sqlstate 'PGRST' using message = '{"code":"NOT_FOUND","message":"찾을 수 없어요."}', detail = '{"status":404,"headers":{}}';
  end if;
  insert into audit_logs (actor_id, actor_name, action, target_student_id, subject)
    values (auth.uid(), (select name from users where id = auth.uid()), 'VIEW_STUDENT_DETAIL', p_student_id, v_subject);
end $$;

-- view 열 추가 (기존 열 순서 유지, 끝에 추가)
create or replace view v_sessions with (security_invoker = true) as
  select id, student_id as "studentId", goal, started_at as "startedAt", ended_at as "endedAt",
         start_auth as "startAuth", end_auth as "endAuth", status,
         case when ended_at is null then null
              else round(extract(epoch from ended_at - started_at) / 60)::int end as "durationMinutes",
         -- 요약에는 AI 대화가 들어가므로 교과 교사에겐 null (교과 교사용은 summary API가 따로 만듦)
         case when student_id = auth.uid() or teaches_student(student_id) then summary end as summary,
         subject
  from sessions;
create or replace view v_feedback with (security_invoker = true) as
  select id, session_id as "sessionId", teacher_id as "teacherId", content, read_at as "readAt",
         created_at as "createdAt", author_subject as "authorSubject"
  from feedback;
create or replace view v_audit_logs with (security_invoker = true) as
  select id, actor_id as "actorId", actor_name as "actorName", action,
         target_student_id as "studentId", created_at as "createdAt", subject from audit_logs;

-- F. 교과 RPC
create or replace function subject_week_sessions(p_class_id uuid, p_subject text, p_week date)
returns table (session_id uuid, student_id uuid, started_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.id, s.student_id, s.started_at
  from sessions s join users u on u.id = s.student_id and u.role = 'student' and u.class_id = p_class_id
  where s.subject = p_subject
    and subject_share_active(s.student_id)
    and current_term(s.started_at) = current_term()
    and (s.started_at at time zone 'Asia/Seoul')::date >= p_week
    and (s.started_at at time zone 'Asia/Seoul')::date <  p_week + 7
$$;

create or replace function subject_students(p_class_id uuid, p_subject text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_assignment(p_class_id, p_subject) then
    raise sqlstate 'PGRST' using message = '{"code":"NOT_FOUND","message":"찾을 수 없어요."}', detail = '{"status":404,"headers":{}}';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'name', u.name, 'classId', u.class_id,
                                                       'number', coalesce(u.number, 0)) order by u.number)
                   from users u
                   where u.role = 'student' and u.class_id = p_class_id and subject_share_active(u.id)), '[]'::jsonb);
end $$;

create or replace function subject_week_summary(p_class_id uuid, p_subject text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_week date := date_trunc('week', now() at time zone 'Asia/Seoul')::date;   -- 서울 월요일
  v_n int; v_sessions int; v_few boolean; v_base jsonb; v_topics jsonb; v_hard jsonb;
begin
  if not has_assignment(p_class_id, p_subject) then
    raise sqlstate 'PGRST' using message = '{"code":"NOT_FOUND","message":"찾을 수 없어요."}', detail = '{"status":404,"headers":{}}';
  end if;

  select count(distinct student_id), count(*) into v_n, v_sessions from subject_week_sessions(p_class_id, p_subject, v_week);
  v_few := v_n between 1 and 2;
  v_base := jsonb_build_object(
    'classId', p_class_id, 'subject', p_subject, 'weekStart', to_char(v_week, 'YYYY-MM-DD'),
    'few', v_few, 'sessionCount', case when v_few then 0 else v_sessions end,
    'studentCount', case when v_few then to_jsonb('적음'::text) else to_jsonb(v_n) end);
  if v_n = 0 or v_few then
    return v_base || jsonb_build_object('topics', '[]'::jsonb, 'hardQuestions', '[]'::jsonb);
  end if;

  with ws as (select * from subject_week_sessions(p_class_id, p_subject, v_week)),
  studied as (
    select distinct st.topic_id, ws.student_id from ws left join session_topics st on st.session_id = ws.session_id),
  last_att as (
    select distinct on (qa.student_id, qa.topic_id)
           qa.student_id, qa.topic_id, qa.session_id, qa.total, qa.correct::float8 / qa.total as rate
    from quiz_attempts qa join ws on ws.session_id = qa.session_id
    where qa.total > 0
    order by qa.student_id, qa.topic_id, qa.created_at desc),
  reviewed as (
    select la.topic_id, la.student_id from last_att la left join reflections r on r.session_id = la.session_id
    where la.total >= 3 and ((r.understanding = 3 and la.rate < 0.6) or la.rate < 0.4)),
  raw as (
    select s.topic_id, coalesce(t.name, '주제 없음') as name, count(*)::int as student_n,
           case when s.topic_id is null then 0
                else (select count(*) from reviewed rv where rv.topic_id = s.topic_id)::int end as review_n,
           case when s.topic_id is null then null
                else (select case when count(*) >= 3 then avg(la.rate) end from last_att la where la.topic_id = s.topic_id) end as last_rate
    from studied s left join topics t on t.id = s.topic_id
    group by s.topic_id, t.name),
  resp as (   -- 학생별·문항별 마지막 응답 (신고·교사 제외 문항은 먼저 뺌)
    select distinct on (i.item->>'questionId', ws.student_id)
           i.item->>'questionId' as qid, i.item->>'prompt' as prompt, coalesce((i.item->>'correct')::boolean, false) as correct
    from quiz_attempts qa join ws on ws.session_id = qa.session_id
    cross join lateral jsonb_array_elements(qa.items) with ordinality as i(item, ord)
    where not coalesce((i.item->>'reported')::boolean, false) and not coalesce((i.item->>'excluded')::boolean, false)
    order by i.item->>'questionId', ws.student_id, ws.started_at desc, qa.created_at desc, i.ord desc),
  hard as (
    select qid, (array_agg(prompt))[1] as prompt, count(*) filter (where correct)::float8 / count(*) as rate, count(*)::int as answered
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

-- 노출 권한: 정책에서 쓰는 teaches_subject* 만 authenticated, 내부 헬퍼는 함수 안에서만
grant select on v_my_assignments to authenticated;
revoke execute on function subject_share_active(uuid), has_assignment(uuid, text),
  subject_week_sessions(uuid, text, date) from public, anon, authenticated;
revoke execute on function teaches_subject(uuid, text, timestamptz), teaches_subject_session(uuid),
  log_student_view(uuid, text), subject_students(uuid, text), subject_week_summary(uuid, text) from public, anon;
grant execute on function teaches_subject(uuid, text, timestamptz), teaches_subject_session(uuid),
  log_student_view(uuid, text), subject_students(uuid, text), subject_week_summary(uuid, text) to authenticated;

-- ───────────── v1.1 과목 질문 핵심 요약 (migrations/2026-11-14_v1.1.sql 과 같음) ─────────────

create table if not exists question_themes (
  class_id    uuid not null references classes(id) on delete cascade,
  subject     text not null check (subject in ('국어','수학','영어','사회','과학')),
  week_start  date not null,                                   -- 서울 월요일
  status      text not null check (status in ('OK','FEW')),
  themes      jsonb not null default '[]',                     -- [{title, studentCount, topicName}] (질문 번호·학생 ID 없음)
  hidden_count int not null default 0,
  contributing_student_ids uuid[] not null default '{}',       -- 철회 검사용, 응답에 안 냄
  generated_by uuid not null references users(id),
  generated_at timestamptz not null default now(),
  primary key (class_id, subject, week_start)
);
alter table question_themes enable row level security;          -- 정책 없음: 조회는 question_themes(), 쓰기는 서버만

create table if not exists question_theme_calls (
  teacher_id uuid not null,
  class_id   uuid not null,
  subject    text not null,
  created_at timestamptz not null default now()
);
alter table question_theme_calls enable row level security;

-- 생성 기록 (학생 ID 없음, 반·과목만)
alter table audit_logs alter column target_student_id drop not null;
alter table audit_logs add column if not exists class_id uuid references classes(id) on delete cascade;
alter table audit_logs drop constraint if exists audit_logs_action_check;
alter table audit_logs add constraint audit_logs_action_check check (action in ('VIEW_STUDENT_DETAIL','QUESTION_THEMES_GENERATE'));
-- 열람 기록 화면은 학생 열람만 (생성 기록은 화면에 섞지 않음)
create or replace view v_audit_logs with (security_invoker = true) as
  select id, actor_id as "actorId", actor_name as "actorName", action,
         target_student_id as "studentId", created_at as "createdAt", subject
  from audit_logs where action = 'VIEW_STUDENT_DETAIL';

-- AI 동의: 이 기능은 명시적 동의(granted=true)만 (요청서 v1.1 3절)
create or replace function ai_consent_active(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select granted from consents where student_id = sid and kind = 'AI'
                   order by created_at desc limit 1), false)
$$;

-- 사용자당 분당 10회 + 반·과목당 하루(서울) 5회. 넘으면 'MINUTE' / 'DAY', 통과면 null
create or replace function take_theme_slot(p_teacher_id uuid, p_class_id uuid, p_subject text) returns text
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('theme-t:' || p_teacher_id));
  perform pg_advisory_xact_lock(hashtext('theme-c:' || p_class_id || p_subject));
  if (select count(*) from question_theme_calls where teacher_id = p_teacher_id
      and created_at > now() - interval '1 minute') >= 10 then return 'MINUTE'; end if;
  if (select count(*) from question_theme_calls where class_id = p_class_id and subject = p_subject
      and (created_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date) >= 5 then return 'DAY'; end if;
  insert into question_theme_calls (teacher_id, class_id, subject) values (p_teacher_id, p_class_id, p_subject);
  return null;
end $$;

-- AI 입력: 배정 교사 + 그 반·과목·현재 학기 세션 + 세 동의 + 교사 공개 QUESTION + 이번 주(서울) + 최신 200개
create or replace function question_theme_inputs(p_teacher_id uuid, p_class_id uuid, p_subject text)
returns table (student_id uuid, content text)
language sql stable security definer set search_path = public as $$
  select s.student_id, e.content
  from entries e
  join sessions s on s.id = e.session_id
  join users u on u.id = s.student_id and u.role = 'student' and u.class_id = p_class_id
  where exists (select 1 from users t join teacher_assignments ta on ta.teacher_id = t.id
                where t.id = p_teacher_id and t.role = 'teacher' and ta.class_id = p_class_id
                  and ta.subject = p_subject and ta.term = current_term())
    and p_subject in ('국어','수학','영어','사회','과학')
    and s.subject = p_subject
    and current_term(s.started_at) = current_term()
    and subject_share_active(s.student_id)
    and ai_consent_active(s.student_id)
    and e.kind = 'QUESTION' and e.visibility = 'TEACHER'
    and e.created_at >= (date_trunc('week', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')
    and e.content ~ '\S'
  order by e.created_at desc
  limit 200
$$;

-- 조회: 배정 없으면 404, 이번 주 결과 없거나 기여 학생 중 동의 철회가 있으면 EMPTY
create or replace function question_themes(p_class_id uuid, p_subject text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_week date := date_trunc('week', now() at time zone 'Asia/Seoul')::date;
  r question_themes;
begin
  if not has_assignment(p_class_id, p_subject) then
    raise sqlstate 'PGRST' using message = '{"code":"NOT_FOUND","message":"찾을 수 없어요."}', detail = '{"status":404,"headers":{}}';
  end if;
  select * into r from question_themes q where q.class_id = p_class_id and q.subject = p_subject and q.week_start = v_week;
  if not found or exists (select 1 from unnest(r.contributing_student_ids) sid
                          where not (subject_share_active(sid) and ai_consent_active(sid))) then
    return jsonb_build_object('classId', p_class_id, 'subject', p_subject, 'weekStart', to_char(v_week, 'YYYY-MM-DD'),
      'generatedAt', null, 'status', 'EMPTY', 'themes', '[]'::jsonb, 'hiddenCount', 0);
  end if;
  return jsonb_build_object('classId', p_class_id, 'subject', p_subject, 'weekStart', to_char(v_week, 'YYYY-MM-DD'),
    'generatedAt', r.generated_at, 'status', r.status, 'themes', r.themes, 'hiddenCount', r.hidden_count);
end $$;

-- 노출: 조회 RPC와 본인 배정 확인(has_assignment, 생성 엔드포인트가 교사 토큰으로 부름)만 authenticated
revoke execute on function ai_consent_active(uuid), take_theme_slot(uuid, uuid, text),
  question_theme_inputs(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function question_themes(uuid, text), has_assignment(uuid, text) from public, anon;
grant execute on function question_themes(uuid, text), has_assignment(uuid, text) to authenticated;
revoke all on question_themes, question_theme_calls from anon, authenticated;

-- ───────────── v1.0 QR 단일 인증 (migrations/2026-11-14_v1.0.sql 과 같음) ─────────────

create table if not exists qr_tokens (
  token_hash  text primary key,                               -- SHA-256 (원문은 저장 안 함)
  student_id  uuid not null references users(id) on delete cascade,
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists qr_tokens_recent on qr_tokens (student_id, created_at);
alter table qr_tokens enable row level security;               -- 정책 없음: 서버 함수만

create table if not exists qr_scans (                          -- 단말기 분당 20회 제한용 (성공·실패 모두)
  device_id  text not null references devices(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists qr_scans_recent on qr_scans (device_id, created_at);
alter table qr_scans enable row level security;

-- 발급: 학생당 분당 10회 (원자적). 넘으면 null
create or replace function issue_qr_token(p_student_id uuid, p_token_hash text) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare v_expires timestamptz := now() + interval '60 seconds';
begin
  perform pg_advisory_xact_lock(hashtext('qr-issue:' || p_student_id));
  if (select count(*) from qr_tokens where student_id = p_student_id and created_at > now() - interval '1 minute') >= 10 then
    return null;
  end if;
  insert into qr_tokens (token_hash, student_id, expires_at) values (p_token_hash, p_student_id, v_expires);
  return v_expires;
end $$;

-- 스캔: 단말기 분당 20회 → 토큰 1회 소비 → 같은 학생의 남은 미사용 이벤트 무효화 → QR 이벤트 생성
-- 반환 status: OK / RATE_LIMITED / NOT_FOUND / USED_OR_EXPIRED
create or replace function scan_qr_token(p_device_id text, p_token_hash text)
returns table (status text, event_id uuid)
language plpgsql security definer set search_path = public as $$
declare v_student uuid; v_event uuid;
begin
  perform pg_advisory_xact_lock(hashtext('qr-scan:' || p_device_id));
  if (select count(*) from qr_scans where device_id = p_device_id and created_at > now() - interval '1 minute') >= 20 then
    return query select 'RATE_LIMITED', null::uuid; return;
  end if;
  insert into qr_scans (device_id) values (p_device_id);
  update qr_tokens set consumed_at = now()
    where token_hash = p_token_hash and consumed_at is null and expires_at > now()
    returning student_id into v_student;
  if v_student is null then
    return query select case when exists (select 1 from qr_tokens where token_hash = p_token_hash)
                             then 'USED_OR_EXPIRED' else 'NOT_FOUND' end, null::uuid;
    return;
  end if;
  update auth_events set consumed_at = now() where student_id = v_student and consumed_at is null;
  insert into auth_events (student_id, device_id, method, success) values (v_student, p_device_id, 'QR', true)
    returning id into v_event;
  return query select 'OK', v_event;
end $$;

revoke execute on function issue_qr_token(uuid, text), scan_qr_token(text, text) from public, anon, authenticated;
revoke all on qr_tokens, qr_scans from anon, authenticated;

-- ───────────── v1.2 (migrations/2026-11-14_v1.2.sql 과 같음) ─────────────
-- v1.2 QR 전환 정리: FACEPASS 동의는 새로 받지 않음 (옛 행은 이력으로 남김 → NOT VALID: 새 행만 검사)
alter table consents drop constraint if exists consents_no_new_facepass;
alter table consents add constraint consents_no_new_facepass check (kind <> 'FACEPASS') not valid;
