create table if not exists feed_refresh_runs (
  id bigserial primary key,
  scope text not null check (scope in ('single', 'all')),
  status text not null check (status in ('queued', 'running', 'succeeded', 'failed')),
  requested_by text,
  feed_id bigint references feeds(id) on delete cascade,
  total_count integer not null default 0,
  succeeded_count integer not null default 0,
  failed_count integer not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists feed_refresh_runs_status_idx
  on feed_refresh_runs (status);

create index if not exists feed_refresh_runs_scope_idx
  on feed_refresh_runs (scope);

create index if not exists feed_refresh_runs_feed_id_idx
  on feed_refresh_runs (feed_id);

create table if not exists feed_refresh_run_items (
  run_id bigint not null references feed_refresh_runs(id) on delete cascade,
  feed_id bigint not null references feeds(id) on delete cascade,
  status text not null check (status in ('queued', 'running', 'succeeded', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feed_refresh_run_items_run_id_feed_id_key unique (run_id, feed_id)
);

create index if not exists feed_refresh_run_items_run_id_idx
  on feed_refresh_run_items (run_id);

create index if not exists feed_refresh_run_items_feed_id_idx
  on feed_refresh_run_items (feed_id);

create index if not exists feed_refresh_run_items_status_idx
  on feed_refresh_run_items (status);
