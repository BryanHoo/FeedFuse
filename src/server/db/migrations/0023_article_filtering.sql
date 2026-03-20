alter table articles
  add column if not exists filter_status text not null default 'passed',
  add column if not exists is_filtered boolean not null default false,
  add column if not exists filtered_by text[] not null default '{}'::text[],
  add column if not exists filter_evaluated_at timestamptz null,
  add column if not exists filter_error_message text null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'articles_filter_status_check'
  ) then
    alter table articles
      add constraint articles_filter_status_check
        check (filter_status in ('pending', 'passed', 'filtered', 'error'));
  end if;
end $$;

update articles
set
  filter_status = coalesce(filter_status, 'passed'),
  is_filtered = coalesce(is_filtered, false),
  filtered_by = coalesce(filtered_by, '{}'::text[]),
  filter_evaluated_at = coalesce(filter_evaluated_at, fetched_at),
  filter_error_message = filter_error_message
where
  filter_status is null
  or is_filtered is null
  or filtered_by is null
  or filter_evaluated_at is null;

alter table feeds
  add column if not exists full_text_on_fetch_enabled boolean not null default false;

create index if not exists articles_feed_is_filtered_published_idx
  on articles (feed_id, is_filtered, published_at desc, id desc);

create index if not exists articles_filter_status_is_read_published_idx
  on articles (filter_status, is_read, published_at desc, id desc);
