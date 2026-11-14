-- v0.8 (2026-11-14): 휴대폰에서 올린 기록이 PC 학습 화면에 바로 보이도록 entries Realtime 켜기 (RLS 그대로 적용)
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'entries') then
    alter publication supabase_realtime add table entries;
  end if;
end $$;
