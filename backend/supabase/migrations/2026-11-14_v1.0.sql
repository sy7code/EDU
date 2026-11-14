-- v1.0 QR 단일 인증: 1회용 QR 토큰(60초) 발급·스캔. 데이터를 지우지 않음. 다시 실행해도 됨

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
