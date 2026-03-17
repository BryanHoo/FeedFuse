create table if not exists ai_digest_run_sources (
  run_id uuid not null references ai_digest_runs(id) on delete cascade,
  source_article_id uuid not null references articles(id) on delete cascade,
  position int not null,
  created_at timestamptz not null default now(),
  primary key (run_id, source_article_id),
  unique (run_id, position)
);

create index if not exists ai_digest_run_sources_source_article_idx
  on ai_digest_run_sources(source_article_id);
