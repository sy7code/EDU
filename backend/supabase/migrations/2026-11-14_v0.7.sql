-- v0.7 (2026-11-14): 신고 AI 1차 검토, 피드백 읽음 서버 시각
-- 공유 데모 DB에 데이터를 지우지 않고 적용. 새로 설치할 때는 schema.sql에 이미 포함되어 있음

alter table quiz_reports drop constraint quiz_reports_status_check;
alter table quiz_reports add constraint quiz_reports_status_check
  check (status in ('OPEN','KEEP_EXCLUDED','DISMISSED','AI_CLEARED'));
alter table quiz_reports add column if not exists ai_review jsonb;

create table if not exists quiz_question_reviews (
  class_id uuid not null references classes(id) on delete cascade,
  question_id uuid not null references topic_questions(id) on delete cascade,
  verdict text check (verdict in ('OK','ERROR')),
  reason text,
  created_at timestamptz not null default now(),
  primary key (class_id, question_id)
);
alter table quiz_question_reviews enable row level security;
-- 기존 신고가 있는 문항은 이미 "첫 신고"가 지난 것으로 표시 (검토 결과 없음 = 교사 판단)
insert into quiz_question_reviews (class_id, question_id)
  select distinct u.class_id, r.question_id from quiz_reports r join users u on u.id = r.student_id
  on conflict do nothing;

create or replace function feedback_read_at() returns trigger
language plpgsql as $$
begin
  new.read_at := case when old.read_at is not null then old.read_at
                      when new.read_at is not null then now() end;
  return new;
end $$;
drop trigger if exists feedback_read_at on feedback;
create trigger feedback_read_at before update on feedback
  for each row execute function feedback_read_at();

create or replace function class_reported_questions(p_class_id uuid) returns json
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
