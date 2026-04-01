alter table if exists feed_favicons
  add column if not exists fetch_status text,
  add column if not exists failure_reason text,
  add column if not exists next_retry_at timestamptz;

update feed_favicons
set fetch_status = 'ready'
where fetch_status is null;

alter table if exists feed_favicons
  alter column fetch_status set default 'ready',
  alter column fetch_status set not null,
  alter column source_url drop not null,
  alter column content_type drop not null,
  alter column body drop not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'feed_favicons_fetch_status_check'
  ) then
    alter table feed_favicons
      add constraint feed_favicons_fetch_status_check
      check (fetch_status in ('ready', 'failed'));
  end if;
end
$$;
