-- Match keyset pagination expression in reader snapshot queries.
create index if not exists articles_sort_published_id_idx
  on articles ((coalesce(published_at, 'epoch'::timestamptz)) desc, id desc);

create index if not exists articles_feed_sort_published_id_idx
  on articles (feed_id, (coalesce(published_at, 'epoch'::timestamptz)) desc, id desc);

create index if not exists articles_unread_sort_published_id_idx
  on articles ((coalesce(published_at, 'epoch'::timestamptz)) desc, id desc)
  where is_read = false;

create index if not exists articles_starred_sort_published_id_idx
  on articles ((coalesce(published_at, 'epoch'::timestamptz)) desc, id desc)
  where is_starred = true;

-- Speed up unread counters and bulk mark-read by feed.
create index if not exists articles_unread_feed_id_idx
  on articles (feed_id)
  where is_read = false;

-- Match fetch scheduler access path: where enabled = true order by created_at, id.
create index if not exists feeds_enabled_created_at_id_idx
  on feeds (created_at asc, id asc)
  where enabled = true;

create index if not exists categories_position_name_idx
  on categories (position asc, name asc);

-- Replaced by expression/partial indexes above.
drop index if exists articles_feed_published_idx;
drop index if exists articles_is_read_published_idx;
drop index if exists articles_is_starred_published_idx;

-- Covered by unique index (article_id, type) via leftmost prefix.
drop index if exists article_tasks_article_id_idx;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'feeds_fetch_interval_minutes_positive'
      and conrelid = 'feeds'::regclass
  ) then
    alter table feeds
      add constraint feeds_fetch_interval_minutes_positive
      check (fetch_interval_minutes > 0)
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'app_settings_rss_timeout_ms_positive'
      and conrelid = 'app_settings'::regclass
  ) then
    alter table app_settings
      add constraint app_settings_rss_timeout_ms_positive
      check (rss_timeout_ms > 0)
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'article_tasks_attempts_non_negative'
      and conrelid = 'article_tasks'::regclass
  ) then
    alter table article_tasks
      add constraint article_tasks_attempts_non_negative
      check (attempts >= 0)
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'article_tasks_type_check'
      and conrelid = 'article_tasks'::regclass
  ) then
    alter table article_tasks
      add constraint article_tasks_type_check
      check (type in ('fulltext', 'ai_summary', 'ai_translate'))
      not valid;
  end if;
end $$;
