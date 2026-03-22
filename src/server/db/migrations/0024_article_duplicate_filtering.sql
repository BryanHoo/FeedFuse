alter table articles
  add column if not exists normalized_title text null,
  add column if not exists normalized_link text null,
  add column if not exists content_fingerprint text null,
  add column if not exists duplicate_of_article_id bigint null references articles(id) on delete set null,
  add column if not exists duplicate_reason text null,
  add column if not exists duplicate_score real null,
  add column if not exists duplicate_checked_at timestamptz null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'articles_duplicate_reason_check'
  ) then
    alter table articles
      add constraint articles_duplicate_reason_check
        check (
          duplicate_reason is null
          or duplicate_reason in ('same_normalized_url', 'same_title', 'similar_content')
        );
  end if;
end $$;

create index if not exists articles_published_at_id_idx
  on articles (published_at desc, id desc);

create index if not exists articles_normalized_link_idx
  on articles (normalized_link);

create index if not exists articles_normalized_title_published_at_id_idx
  on articles (normalized_title, published_at desc, id desc);

create index if not exists articles_fetched_at_id_idx
  on articles (fetched_at asc, id asc);
