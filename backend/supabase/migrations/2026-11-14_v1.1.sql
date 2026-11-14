-- v1.1 과목 질문 핵심 요약: 저장·횟수 제한·입력 거름·조회 RPC
-- 데이터를 지우지 않음. 다시 실행해도 됨

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
