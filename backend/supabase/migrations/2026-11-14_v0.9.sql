-- v0.9 교과 교사: 배정·과목 공유 동의·sessions.subject·열람 정책·피드백 과목·열람 기록 과목·요약 RPC
-- 데이터를 지우지 않음. 다시 실행해도 됨

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
