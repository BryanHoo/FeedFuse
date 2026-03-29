create table if not exists feed_favicons (
  feed_id bigint primary key references feeds(id) on delete cascade,
  fetch_status text not null default 'ready' check (fetch_status in ('ready', 'failed')),
  source_url text,
  content_type text,
  body bytea,
  etag text,
  last_modified text,
  failure_reason text,
  next_retry_at timestamptz,
  fetched_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

update feeds
set icon_url = '/api/feeds/' || id::text || '/favicon'
where kind = 'rss'
  and site_url is not null
  and btrim(site_url) <> '';
