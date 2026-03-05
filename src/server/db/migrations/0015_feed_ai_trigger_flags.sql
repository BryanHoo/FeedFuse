alter table feeds
  add column if not exists ai_summary_on_fetch_enabled boolean not null default false,
  add column if not exists body_translate_on_fetch_enabled boolean not null default false,
  add column if not exists body_translate_on_open_enabled boolean not null default false;

update feeds
set body_translate_on_open_enabled = body_translate_enabled
where body_translate_enabled = true;
