alter table feeds
  add column if not exists kind text not null default 'rss';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'feeds_kind_check'
      and conrelid = 'feeds'::regclass
  ) then
    alter table feeds
      add constraint feeds_kind_check
        check (kind in ('rss', 'ai_digest'));
  end if;
end
$$;

create table if not exists ai_digest_configs (
  feed_id uuid primary key references feeds(id) on delete cascade,
  prompt text not null,
  interval_minutes int not null,
  top_n int not null default 10,
  selected_feed_ids uuid[] not null default '{}'::uuid[],
  selected_category_ids uuid[] not null default '{}'::uuid[],
  last_window_end_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_digest_configs_interval_minutes_positive check (interval_minutes > 0),
  constraint ai_digest_configs_top_n_positive check (top_n > 0)
);

create table if not exists ai_digest_runs (
  id uuid primary key default gen_random_uuid(),
  feed_id uuid not null references feeds(id) on delete cascade,
  window_start_at timestamptz not null,
  window_end_at timestamptz not null,
  status text not null,
  candidate_total int not null default 0,
  selected_count int not null default 0,
  article_id uuid null references articles(id),
  model text null,
  error_code text null,
  error_message text null,
  job_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_digest_runs_status_check check (
    status in ('queued', 'running', 'succeeded', 'failed', 'skipped_no_updates')
  )
);

create unique index if not exists ai_digest_runs_feed_window_unique
  on ai_digest_runs(feed_id, window_start_at);

create index if not exists articles_feed_fetched_id_idx
  on articles(feed_id, fetched_at desc, id desc);
